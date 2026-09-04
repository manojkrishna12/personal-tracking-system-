import { computeStreaks } from './streaks'
import { addDaysStr, eachDayStr } from '../utils/dates'

export interface HabitDefLike {
  key: string
  label: string
  type: string
  weeklyGoal: { min: number | null; max: number | null }
}

export interface RecordLike {
  date: string
  habits: { habitKey: string; status?: string }[]
  purchases?: { item: string; amount: number; category: string; necessary: boolean; notes?: string | null }[]
  score?: number | null
  quality?: string | null
}

export interface WeightLike {
  date: string
  weightKg: number
  note?: string | null
}

export type Directions = Record<string, 'positive' | 'negative'>

function daysLabel(n: number): string {
  return n === 1 ? '1 day' : `${n} days`
}

function completedCounts(records: RecordLike[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of records) {
    for (const h of r.habits) {
      if (h.status === 'completed') counts[h.habitKey] = (counts[h.habitKey] ?? 0) + 1
    }
  }
  return counts
}

function habitDoneDates(records: RecordLike[]): Record<string, string[]> {
  const done: Record<string, string[]> = {}
  for (const r of records) {
    for (const h of r.habits) {
      if (h.status === 'completed') (done[h.habitKey] ??= []).push(r.date)
    }
  }
  return done
}

export interface WeeklyInsightsResult {
  weekStart: string
  weekEnd: string
  trackedDays: number
  counts: Record<string, number>
  averageScore: number | null
  prevWeekAverageScore: number | null
  goalMessages: string[]
  focusMessages: string[]
  observations: string[]
}

export function computeWeeklyInsights(args: {
  records: RecordLike[]
  prevWeekRecords: RecordLike[]
  habitDefs: HabitDefLike[]
  directions: Directions
  weekStart: string
  weekEnd: string
}): WeeklyInsightsResult {
  const { records, prevWeekRecords, habitDefs, directions, weekStart, weekEnd } = args
  const daysInWeek = 7
  const counts = completedCounts(records)
  const tracked = records.filter((r) => r.score != null)
  const averageScore = tracked.length > 0 ? Math.round(tracked.reduce((s, r) => s + (r.score ?? 0), 0) / tracked.length) : null
  const prevTracked = prevWeekRecords.filter((r) => r.score != null)
  const prevWeekAverageScore =
    prevTracked.length > 0 ? Math.round(prevTracked.reduce((s, r) => s + (r.score ?? 0), 0) / prevTracked.length) : null

  const goals: { label: string; key: string; type: 'min' | 'max'; target: number; actual: number }[] = []
  for (const def of habitDefs) {
    const actual = counts[def.key] ?? 0
    if (def.weeklyGoal.min != null) goals.push({ label: def.label, key: def.key, type: 'min', target: def.weeklyGoal.min, actual })
    if (def.weeklyGoal.max != null) goals.push({ label: def.label, key: def.key, type: 'max', target: def.weeklyGoal.max, actual })
  }

  const goalMessages = goals.map((g) => {
    if (g.type === 'min') {
      if (g.actual >= g.target) return `${g.label}: ${g.actual}/${g.target} days — goal met.`
      return `${g.label}: ${g.actual}/${g.target} days. Try to reach ${g.target} next week.`
    }
    if (g.actual <= g.target) return `${g.label}: ${daysLabel(g.actual)} — within your target of ${g.target}.`
    return `${g.label}: ${daysLabel(g.actual)}, above your target of ${g.target}.`
  })

  // Next-week focus: biggest shortfall vs a min-goal, then most over a max-goal.
  const shortfalls = goals.filter((g) => g.type === 'min' && g.actual < g.target).sort((a, b) => b.target - b.actual - (a.target - a.actual))
  const overages = goals
    .filter((g) => g.type === 'max' && g.actual > g.target)
    .sort((a, b) => b.actual - b.target - (a.actual - a.target))
  const focusMessages: string[] = []
  if (shortfalls[0]) focusMessages.push(`${shortfalls[0].label}: ${shortfalls[0].actual}/${shortfalls[0].target} days. Try to reach ${shortfalls[0].target} next week.`)
  if (overages[0]) focusMessages.push(`${overages[0].label}: ${daysLabel(overages[0].actual)}, above your target of ${overages[0].target}.`)
  if (focusMessages.length === 0) focusMessages.push('All weekly goals met. Keep it up.')

  const observations: string[] = []

  // Strongest positive habit this week.
  const positiveDefs = habitDefs.filter((d) => directions[d.key] === 'positive')
  const positiveCounts = positiveDefs
    .map((d) => ({ def: d, count: counts[d.key] ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
  if (positiveCounts[0]) {
    observations.push(`Your strongest habit this week was ${positiveCounts[0].def.label} (${positiveCounts[0].count} of ${daysInWeek} days).`)
  }
  const gym = habitDefs.find((d) => d.key === 'gym')
  const gymCount = counts['gym'] ?? 0
  if (gym && gymCount > 0) observations.push(`You went to the gym on ${gymCount} of ${daysInWeek} days.`)

  // Negative behaviors that occurred this week.
  for (const def of habitDefs.filter((d) => directions[d.key] === 'negative' && d.key !== 'thingsBought')) {
    const c = counts[def.key] ?? 0
    if (c > 0) observations.push(`${def.label} occurred on ${daysLabel(c)} this week.`)
  }

  // Week-over-week score comparison.
  if (averageScore != null && prevWeekAverageScore != null) {
    if (averageScore > prevWeekAverageScore) {
      observations.push(`Your average daily score improved compared with last week (${prevWeekAverageScore} → ${averageScore}).`)
    } else if (averageScore < prevWeekAverageScore) {
      observations.push(`Your average daily score dropped compared with last week (${prevWeekAverageScore} → ${averageScore}).`)
    } else {
      observations.push(`Your average daily score matched last week (${averageScore}).`)
    }
  }

  if (tracked.length < 3) {
    observations.push('Not enough data this week — track at least 3 days for reliable insights.')
  }

  // Simple co-occurrence patterns among positive habits (only with enough data).
  const positiveKeys = positiveDefs.map((d) => d.key)
  const done = habitDoneDates(records)
  const correlations: { a: HabitDefLike; b: HabitDefLike; overlap: number; base: number }[] = []
  for (const aKey of positiveKeys) {
    for (const bKey of positiveKeys) {
      if (aKey === bKey) continue
      const aDates = done[aKey] ?? []
      if (aDates.length < 3) continue
      const bSet = new Set(done[bKey] ?? [])
      const overlap = aDates.filter((d) => bSet.has(d)).length
      correlations.push({
        a: positiveDefs.find((d) => d.key === aKey)!,
        b: positiveDefs.find((d) => d.key === bKey)!,
        overlap,
        base: aDates.length,
      })
    }
  }
  correlations.sort((x, y) => Math.abs(y.overlap / y.base - 0.5) - Math.abs(x.overlap / x.base - 0.5))
  const verb = (key: string): string => {
    switch (key) {
      case 'gym':
        return 'went to the gym'
      case 'study':
        return 'studied'
      case 'protein':
        return 'hit your protein'
      default:
        return `did ${positiveDefs.find((d) => d.key === key)?.label ?? key}`
    }
  }
  for (const c of correlations.slice(0, 2)) {
    const frac = c.overlap / c.base
    if (Math.abs(frac - 0.5) >= 0.2) {
      observations.push(`On days you ${verb(c.a.key)}, you ${verb(c.b.key)} on ${c.overlap} of ${c.base} days.`)
    }
  }

  return { weekStart, weekEnd, trackedDays: tracked.length, counts, averageScore, prevWeekAverageScore, goalMessages, focusMessages, observations }
}

export interface MonthlyInsightsResult {
  month: string
  trackedDays: number
  qualityCounts: { excellent: number; average: number; poor: number }
  counts: Record<string, number>
  positiveCompleted: number
  negativeCompleted: number
  scoreSeries: { date: string; score: number }[]
  purchases: {
    total: number
    count: number
    topCategory: string | null
    unnecessaryCount: number
    unnecessaryAmount: number
    unnecessaryShare: number
  }
}

export function computeMonthlyInsights(month: string, records: RecordLike[], directions: Directions): MonthlyInsightsResult {
  const tracked = records.filter((r) => r.score != null)
  const qualityCounts = { excellent: 0, average: 0, poor: 0 }
  for (const r of tracked) {
    if (r.quality === 'excellent') qualityCounts.excellent++
    else if (r.quality === 'average') qualityCounts.average++
    else if (r.quality === 'poor') qualityCounts.poor++
  }
  const counts = completedCounts(records)
  let positiveCompleted = 0
  let negativeCompleted = 0
  for (const r of records) {
    for (const h of r.habits) {
      if (h.status !== 'completed') continue
      if (directions[h.habitKey] === 'positive') positiveCompleted++
      else if (directions[h.habitKey] === 'negative') negativeCompleted++
    }
  }
  const scoreSeries = tracked
    .map((r) => ({ date: r.date, score: r.score as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const purchases = records.flatMap((r) => r.purchases ?? [])
  const total = purchases.reduce((s, p) => s + p.amount, 0)
  const unnecessary = purchases.filter((p) => !p.necessary)
  const unnecessaryAmount = unnecessary.reduce((s, p) => s + p.amount, 0)
  const byCategory = new Map<string, number>()
  for (const p of purchases) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.amount)
  let topCategory: string | null = null
  let topAmount = 0
  for (const [cat, amt] of byCategory) {
    if (amt > topAmount) {
      topAmount = amt
      topCategory = cat
    }
  }

  return {
    month,
    trackedDays: tracked.length,
    qualityCounts,
    counts,
    positiveCompleted,
    negativeCompleted,
    scoreSeries,
    purchases: {
      total,
      count: purchases.length,
      topCategory,
      unnecessaryCount: unnecessary.length,
      unnecessaryAmount,
      unnecessaryShare: total > 0 ? Math.round((unnecessaryAmount / total) * 100) : 0,
    },
  }
}

export interface YearReviewResult {
  year: string
  trackedDays: number
  qualityCounts: { excellent: number; average: number; poor: number }
  counts: Record<string, number>
  totalPurchases: number
  totalPurchaseAmount: number
  bestStreaks: { tracking: number; habits: Record<string, number> }
  mostConsistentHabit: { key: string; label: string; count: number } | null
  needsImprovementHabit: { key: string; label: string; count: number } | null
  weight: {
    first: WeightLike | null
    last: WeightLike | null
    startKg: number | null
    currentKg: number | null
  }
  heatmap: { date: string; quality: string | null }[]
}

export function computeYearReview(args: {
  year: string
  records: RecordLike[]
  weightEntries: WeightLike[]
  habitDefs: HabitDefLike[]
  directions: Directions
}): YearReviewResult {
  const { year, records, weightEntries, habitDefs, directions } = args
  const tracked = records.filter((r) => r.score != null)
  const qualityCounts = { excellent: 0, average: 0, poor: 0 }
  for (const r of tracked) {
    if (r.quality === 'excellent') qualityCounts.excellent++
    else if (r.quality === 'average') qualityCounts.average++
    else if (r.quality === 'poor') qualityCounts.poor++
  }
  const counts = completedCounts(records)

  const purchases = records.flatMap((r) => r.purchases ?? [])
  const totalPurchaseAmount = purchases.reduce((s, p) => s + p.amount, 0)

  const done = habitDoneDates(records)
  const yearEnd = `${year}-12-31`
  const streaks = computeStreaks(records.map((r) => r.date), done, yearEnd)
  const bestStreaks = {
    tracking: streaks.tracking.best,
    habits: Object.fromEntries(Object.entries(streaks.habits).map(([k, v]) => [k, v.best])),
  }

  const positiveDefs = habitDefs.filter((d) => directions[d.key] === 'positive')
  const sortedPos = [...positiveDefs].sort((a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0))
  const mostConsistentHabit =
    sortedPos[0] && (counts[sortedPos[0].key] ?? 0) > 0
      ? { key: sortedPos[0].key, label: sortedPos[0].label, count: counts[sortedPos[0].key] ?? 0 }
      : null
  const leastPos = [...positiveDefs].sort((a, b) => (counts[a.key] ?? 0) - (counts[b.key] ?? 0))
  const needsImprovementHabit =
    leastPos[0] && positiveDefs.length > 1
      ? { key: leastPos[0].key, label: leastPos[0].label, count: counts[leastPos[0].key] ?? 0 }
      : null

  const sortedWeights = [...weightEntries].sort((a, b) => (a.date < b.date ? -1 : 1))
  const first = sortedWeights[0] ?? null
  const last = sortedWeights[sortedWeights.length - 1] ?? null

  const allDays = eachDayStr(`${year}-01-01`, yearEnd)
  const qualityByDate = new Map<string, string>()
  for (const r of tracked) if (r.quality) qualityByDate.set(r.date, r.quality)
  const heatmap = allDays.map((date) => ({ date, quality: qualityByDate.get(date) ?? null }))

  return {
    year,
    trackedDays: tracked.length,
    qualityCounts,
    counts,
    totalPurchases: purchases.length,
    totalPurchaseAmount,
    bestStreaks,
    mostConsistentHabit,
    needsImprovementHabit,
    weight: {
      first,
      last,
      startKg: first?.weightKg ?? null,
      currentKg: last?.weightKg ?? null,
    },
    heatmap,
  }
}

export function averageScoreOf(records: RecordLike[]): number | null {
  const tracked = records.filter((r) => r.score != null)
  return tracked.length > 0 ? Math.round(tracked.reduce((s, r) => s + (r.score ?? 0), 0) / tracked.length) : null
}

export { addDaysStr }