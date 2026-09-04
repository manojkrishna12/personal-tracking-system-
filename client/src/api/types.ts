export interface UserSettings {
  weightGoalKg: number
  weekStartsOn: number
  timezone: string
  theme: 'light' | 'dark'
}

export interface User {
  id: string
  email: string
  name: string
  settings: UserSettings
}

export interface HabitDef {
  key: string
  label: string
  order: number
  type: 'boolean' | 'purchase'
  weeklyGoal: { min: number | null; max: number | null }
}

export interface HabitEntry {
  habitKey: string
  status: 'completed' | 'not_completed'
  details?: string | null
  reason?: string | null
}

export interface Purchase {
  item: string
  amount: number
  category: string
  necessary: boolean
  notes?: string | null
}

export interface ScoreBreakdownItem {
  habitKey: string
  label: string
  effect: number
}

export interface DayRecord {
  date: string
  habits: HabitEntry[]
  purchases: Purchase[]
  score: number | null
  quality: 'excellent' | 'average' | 'poor' | null
  scoreBreakdown: ScoreBreakdownItem[]
}

export interface MonthDay {
  date: string
  score: number | null
  quality: 'excellent' | 'average' | 'poor' | null
}

export interface WeightEntry {
  date: string
  weightKg: number
  note?: string | null
}

export interface StreakResult {
  current: number
  best: number
}

export interface Streaks {
  tracking: StreakResult
  habits: Record<string, StreakResult>
}

export interface WeeklyInsights {
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

export interface MonthlyInsights {
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

export interface YearReview {
  year: string
  trackedDays: number
  qualityCounts: { excellent: number; average: number; poor: number }
  counts: Record<string, number>
  totalPurchases: number
  totalPurchaseAmount: number
  bestStreaks: { tracking: number; habits: Record<string, number> }
  mostConsistentHabit: { key: string; label: string; count: number } | null
  needsImprovementHabit: { key: string; label: string; count: number } | null
  weight: { first: WeightEntry | null; last: WeightEntry | null; startKg: number | null; currentKg: number | null }
  heatmap: { date: string; quality: 'excellent' | 'average' | 'poor' | null }[]
}

export interface ScoringHabit {
  habitKey: string
  enabled: boolean
  direction: 'positive' | 'negative'
  points: number
  cap: number
}

export interface ScoringConfig {
  baseline: number
  habits: ScoringHabit[]
  qualityThresholds: { excellent: number; average: number }
}