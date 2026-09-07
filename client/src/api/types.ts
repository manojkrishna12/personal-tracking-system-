export interface UserSettings {
  weightGoalKg: number
  weekStartsOn: number
  timezone: string
  theme: 'light' | 'dark'
  finance?: { alertThresholdPaise: { cash: number; phonepe: number } }
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
  /** Set only when a legacy purchase was converted into the finance ledger. */
  transactionId?: string | null
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

// ---------------------------------------------------------------------------
// Finance — amounts cross the wire as integer paise (plan §10).
// ---------------------------------------------------------------------------

export type WalletKey = 'cash' | 'phonepe'

export type TransactionType = 'opening_balance' | 'money_received' | 'expense' | 'balance_adjustment'

export type Necessity = 'necessary' | 'optional' | 'wasteful'

export interface WalletOverview {
  key: WalletKey
  label: string
  balancePaise: number
  alertThresholdPaise: number
  low: boolean
  hasOpeningBalance: boolean
  openingBalancePaise: number | null
}

export interface FinanceOverview {
  today: string
  wallets: WalletOverview[]
  totalBalancePaise: number
  spent: { todayPaise: number; weekPaise: number; monthPaise: number }
}

export interface FinanceTransaction {
  _id: string
  walletKey: WalletKey
  type: TransactionType
  date: string
  amountPaise: number
  source?: string | null
  item?: string | null
  categoryKey?: string | null
  necessity?: Necessity | null
  reason?: string | null
  note?: string | null
  history?: { amountPaise: number; changedAt: string }[]
  createdAt: string
  updatedAt: string
}

export interface TransactionPage {
  transactions: FinanceTransaction[]
  nextCursor: string | null
}

export interface FinanceAnalytics {
  from: string | null
  to: string | null
  totals: { receivedPaise: number; spentPaise: number; adjustmentsPaise: number; netFlowPaise: number }
  byWallet: { key: string; label: string; spentPaise: number; receivedPaise: number }[]
  byCategory: { key: string; label: string; spentPaise: number; count: number }[]
  byNecessity: { necessaryPaise: number; optionalPaise: number; wastefulPaise: number; necessaryCount: number; optionalCount: number; wastefulCount: number }
  food: { totalPaise: number; count: number; wastefulPaise: number; byCategory: { key: string; label: string; spentPaise: number; count: number }[] }
  dailySeries: { date: string; spentPaise: number }[]
  moneyFlow: {
    openingPaise: number
    receivedPaise: number
    availablePaise: number
    expensesPaise: number
    adjustmentsPaise: number
    endingPaise: number
  } | null
  largestExpense: { item: string; amountPaise: number; date: string } | null
  counts: { expenses: number; receivedTransactions: number }
  prevComparison: { prevSpentPaise: number; changePct: number | null } | null
}

export interface DadReport {
  from: string | null
  to: string | null
  source: string
  totalPaise: number
  count: number
  averagePaise: number
  byWallet: { cashPaise: number; phonepePaise: number }
  transactions: { _id: string; date: string; amountPaise: number; walletKey: string; note?: string | null }[]
  currentBalanceDisclaimer: string
  currentBalancePaise: number
}

export interface FinanceInsights {
  periodLabel: string
  messages: string[]
  flags: { lowBalance: { walletKey: WalletKey; label: string; balancePaise: number; thresholdPaise: number }[] }
}

export interface LegacyPurchase {
  date: string
  index: number
  item: string
  amount: number
  category: string
  necessary: boolean
}