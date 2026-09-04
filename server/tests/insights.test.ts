import { describe, expect, it } from 'vitest'
import {
  computeMonthlyInsights,
  computeWeeklyInsights,
  computeYearReview,
  type Directions,
  type HabitDefLike,
  type RecordLike,
} from '../src/services/insights'

const defs: HabitDefLike[] = [
  { key: 'protein', label: 'Protein', type: 'boolean', weeklyGoal: { min: 6, max: null } },
  { key: 'eatOutside', label: 'Eat Outside', type: 'boolean', weeklyGoal: { min: null, max: null } },
  { key: 'junkFood', label: 'Junk Food', type: 'boolean', weeklyGoal: { min: null, max: 2 } },
  { key: 'maggie', label: 'Maggie', type: 'boolean', weeklyGoal: { min: null, max: null } },
  { key: 'study', label: 'Study', type: 'boolean', weeklyGoal: { min: 6, max: null } },
  { key: 'gym', label: 'Gym', type: 'boolean', weeklyGoal: { min: 5, max: null } },
  { key: 'thingsBought', label: 'Things Bought', type: 'purchase', weeklyGoal: { min: null, max: null } },
]

const directions: Directions = {
  protein: 'positive',
  eatOutside: 'negative',
  junkFood: 'negative',
  maggie: 'negative',
  study: 'positive',
  gym: 'positive',
  thingsBought: 'negative',
}

const rec = (date: string, habits: [string, 'completed' | 'not_completed'][], score?: number, quality?: string): RecordLike => ({
  date,
  habits: habits.map(([habitKey, status]) => ({ habitKey, status })),
  score,
  quality,
})

// Week: Mon 2026-08-31 → Sun 2026-09-06. Gym 5/7, Study 6/7, Protein 5/7, Junk 2, EatOut 3, Maggie 1.
const weekRecords: RecordLike[] = [
  rec('2026-08-31', [['gym', 'completed'], ['study', 'completed'], ['junkFood', 'completed']], 80, 'excellent'),
  rec('2026-09-01', [['gym', 'completed'], ['study', 'completed'], ['eatOutside', 'completed']], 82, 'excellent'),
  rec('2026-09-02', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed'], ['maggie', 'completed']], 90, 'excellent'),
  rec('2026-09-03', [['gym', 'completed'], ['protein', 'completed'], ['eatOutside', 'completed']], 70, 'average'),
  rec('2026-09-04', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed'], ['junkFood', 'completed'], ['eatOutside', 'completed']], 65, 'average'),
  rec('2026-09-05', [['study', 'completed'], ['protein', 'completed']], 75, 'excellent'),
  rec('2026-09-06', [['study', 'completed'], ['protein', 'completed']], 75, 'excellent'),
]

const baseWeeklyArgs = {
  records: weekRecords,
  prevWeekRecords: [] as RecordLike[],
  habitDefs: defs,
  directions,
  weekStart: '2026-08-31',
  weekEnd: '2026-09-06',
}

describe('computeWeeklyInsights', () => {
  it('counts completed habits per day', () => {
    const r = computeWeeklyInsights(baseWeeklyArgs)
    expect(r.counts['gym']).toBe(5)
    expect(r.counts['study']).toBe(6)
    expect(r.counts['protein']).toBe(5)
    expect(r.counts['junkFood']).toBe(2)
    expect(r.counts['eatOutside']).toBe(3)
    expect(r.counts['maggie']).toBe(1)
    expect(r.trackedDays).toBe(7)
    expect(r.averageScore).toBe(77) // round(537/7)
  })

  it('compares actuals against weekly goals with sober phrasing', () => {
    const r = computeWeeklyInsights(baseWeeklyArgs)
    expect(r.goalMessages).toContain('Gym: 5/5 days — goal met.')
    expect(r.goalMessages).toContain('Study: 6/6 days — goal met.')
    expect(r.goalMessages).toContain('Protein: 5/6 days. Try to reach 6 next week.')
    expect(r.goalMessages).toContain('Junk Food: 2 days — within your target of 2.')
    expect(r.focusMessages[0]).toContain('Protein')
  })

  it('generates observations only from actual stored data', () => {
    const r = computeWeeklyInsights(baseWeeklyArgs)
    const joined = r.observations.join('\n')
    expect(joined).toContain('Your strongest habit this week was Study (6 of 7 days).')
    expect(joined).toContain('You went to the gym on 5 of 7 days.')
    expect(joined).toContain('Junk Food occurred on 2 days this week.')
    expect(joined).toContain('Maggie occurred on 1 day this week.')
    expect(joined).toContain('Eat Outside occurred on 3 days this week.')
  })

  it('compares the average score with the previous week', () => {
    const prev = weekRecords.map((r) => ({ ...r, score: (r.score ?? 0) - 10 }))
    const r = computeWeeklyInsights({ ...baseWeeklyArgs, prevWeekRecords: prev })
    expect(r.prevWeekAverageScore).toBe(67)
    expect(r.observations.join('\n')).toContain('improved compared with last week')
  })

  it('finds co-occurrence patterns when there is enough overlap', () => {
    const r = computeWeeklyInsights(baseWeeklyArgs)
    const joined = r.observations.join('\n')
    // Gym on 5 days; study ✓ on 4 of those 5 → strong pattern.
    expect(joined).toContain('On days you went to the gym, you studied on 4 of 5 days.')
  })

  it('flags sparse weeks instead of inventing insights', () => {
    const r = computeWeeklyInsights({
      ...baseWeeklyArgs,
      records: [weekRecords[0]!, weekRecords[1]!],
      prevWeekRecords: [],
    })
    expect(r.observations.join('\n')).toContain('Not enough data this week')
  })

  it('says all goals met when nothing falls short', () => {
    const allMet: RecordLike[] = [
      rec('2026-08-31', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed']]),
      rec('2026-09-01', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed']]),
      rec('2026-09-02', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed']]),
      rec('2026-09-03', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed'], ['junkFood', 'completed']]),
      rec('2026-09-04', [['gym', 'completed'], ['study', 'completed'], ['protein', 'completed'], ['junkFood', 'completed']]),
      rec('2026-09-05', [['study', 'completed'], ['protein', 'completed']]),
      rec('2026-09-06', [['study', 'completed'], ['protein', 'completed']]),
    ]
    const r = computeWeeklyInsights({ ...baseWeeklyArgs, records: allMet })
    const anyShortfall = r.goalMessages.some((m) => m.includes('Try to reach'))
    expect(anyShortfall).toBe(false)
    expect(r.focusMessages[0]).toContain('All weekly goals met')
  })
})

describe('computeMonthlyInsights', () => {
  it('aggregates quality counts, series and purchase summary', () => {
    const records: RecordLike[] = [
      rec('2026-09-01', [['study', 'completed']], 90, 'excellent'),
      rec('2026-09-02', [['junkFood', 'completed']], 45, 'poor'),
      rec('2026-09-03', [['study', 'completed'], ['gym', 'completed']], 100, 'excellent'),
      {
        date: '2026-09-04',
        habits: [],
        purchases: [
          { item: 'Headphones', amount: 2499, category: 'Electronics', necessary: false },
          { item: 'Rice', amount: 300, category: 'Groceries', necessary: true },
        ],
        score: 52,
        quality: 'average',
      },
    ]
    const r = computeMonthlyInsights('2026-09', records, directions)
    expect(r.trackedDays).toBe(4)
    expect(r.qualityCounts).toEqual({ excellent: 2, average: 1, poor: 1 })
    expect(r.positiveCompleted).toBe(3) // study, study, gym
    expect(r.negativeCompleted).toBe(1) // junkFood
    expect(r.scoreSeries.map((s) => s.score)).toEqual([90, 45, 100, 52])
    expect(r.purchases.total).toBe(2799)
    expect(r.purchases.count).toBe(2)
    expect(r.purchases.topCategory).toBe('Electronics')
    expect(r.purchases.unnecessaryCount).toBe(1)
    expect(r.purchases.unnecessaryShare).toBe(Math.round((2499 / 2799) * 100))
  })
})

describe('computeYearReview', () => {
  it('produces year totals, best streaks, heatmap and weight progress', () => {
    const records: RecordLike[] = [
      rec('2026-01-01', [['study', 'completed'], ['gym', 'completed']], 95, 'excellent'),
      rec('2026-01-02', [['study', 'completed'], ['gym', 'completed']], 95, 'excellent'),
      rec('2026-01-04', [['study', 'completed']], 80, 'excellent'),
    ]
    const weightEntries = [
      { date: '2026-01-01', weightKg: 90 },
      { date: '2026-01-15', weightKg: 89.2 },
    ]
    const r = computeYearReview({ year: '2026', records, weightEntries, habitDefs: defs, directions })
    expect(r.trackedDays).toBe(3)
    expect(r.qualityCounts.excellent).toBe(3)
    expect(r.bestStreaks.tracking).toBe(2)
    expect(r.bestStreaks.habits['study']).toBe(2)
    expect(r.mostConsistentHabit?.key).toBe('study')
    expect(r.needsImprovementHabit?.key).toBe('protein')
    expect(r.heatmap.length).toBe(365)
    expect(r.heatmap.filter((d) => d.quality !== null).length).toBe(3)
    expect(r.weight.startKg).toBe(90)
    expect(r.weight.currentKg).toBe(89.2)
  })
})