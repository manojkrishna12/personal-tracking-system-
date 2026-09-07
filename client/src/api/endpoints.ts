import { api } from './client'
import type {
  DadReport,
  DayRecord,
  FinanceAnalytics,
  FinanceInsights,
  FinanceOverview,
  FinanceTransaction,
  HabitDef,
  LegacyPurchase,
  MonthDay,
  MonthlyInsights,
  Purchase,
  ScoringConfig,
  Streaks,
  TransactionPage,
  User,
  UserSettings,
  WalletKey,
  WeeklyInsights,
  WeightEntry,
  YearReview,
} from './types'

// Auth
export const getMe = () => api<{ user: User }>('/auth/me')
export const login = (email: string, password: string) => api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } })
export const register = (email: string, password: string, name: string) =>
  api<{ user: User }>('/auth/register', { method: 'POST', body: { email, password, name } })
export const logout = () => api<void>('/auth/logout', { method: 'POST' })

// Days
export const getMonthDays = (month: string) => api<{ month: string; days: MonthDay[] }>(`/days?month=${month}`)
export const getDay = (date: string) => api<DayRecord>(`/days/${date}`)
export const saveDay = (
  date: string,
  body: { habits: { habitKey: string; status?: 'completed' | 'not_completed'; details?: string; reason?: string }[]; purchases?: Purchase[] },
) => api<DayRecord>(`/days/${date}`, { method: 'PUT', body })
export const deleteDay = (date: string) => api<void>(`/days/${date}`, { method: 'DELETE' })

// Habits
export const getHabits = () => api<{ habits: HabitDef[] }>('/habits')
export const saveHabits = (habits: Partial<HabitDef>[]) => api<{ habits: HabitDef[] }>('/habits', { method: 'PUT', body: { habits } })

// Weight
export const getWeight = (limit = 500) => api<{ entries: WeightEntry[] }>(`/weight?limit=${limit}`)
export const saveWeight = (date: string, body: { weightKg: number; note?: string }) => api<{ entry: WeightEntry }>(`/weight/${date}`, { method: 'PUT', body })
export const deleteWeight = (date: string) => api<void>(`/weight/${date}`, { method: 'DELETE' })

// Settings
export const getSettings = () => api<{ settings: UserSettings }>('/settings')
export const saveSettings = (settings: UserSettings) => api<{ settings: UserSettings }>('/settings', { method: 'PUT', body: settings })
export const getScoringConfig = () => api<ScoringConfig>('/settings/scoring')
export const saveScoringConfig = (config: ScoringConfig) => api<ScoringConfig>('/settings/scoring', { method: 'PUT', body: config })
export const recomputeScores = () => api<{ recomputed: number }>('/settings/scores/recompute', { method: 'POST' })

// Insights
export const getStreaks = () => api<Streaks>('/insights/streaks')
export const getWeeklyInsights = (date: string) => api<WeeklyInsights>(`/insights/weekly?date=${date}`)
export const getMonthlyInsights = (month: string) => api<MonthlyInsights>(`/insights/monthly?month=${month}`)
export const getYearReview = (year: string) => api<YearReview>(`/insights/year?year=${year}`)

// ---------------------------------------------------------------------------
// Finance — all amounts in integer paise; ids are ledger transaction ids.
// ---------------------------------------------------------------------------

export const getFinanceOverview = () => api<FinanceOverview>('/finance/overview')

export const saveFinanceSettings = (alertThresholdPaise: { cash: number; phonepe: number }) =>
  api<{ alertThresholdPaise: { cash: number; phonepe: number } }>('/finance/settings', { method: 'PUT', body: { alertThresholdPaise } })

export const putOpeningBalance = (body: {
  walletKey: WalletKey
  amountPaise: number
  acknowledged?: boolean
  previousAmountPaise?: number
  date?: string
}) =>
  api<{
    transaction: FinanceTransaction
    created: boolean
    previousAmountPaise: number | null
    balanceImpactPaise: number
    walletBalancePaise: number
  }>('/finance/opening-balance', { method: 'PUT', body })

export const postAdjustment = (body: { walletKey: WalletKey; deltaPaise: number; reason: string; date?: string; clientToken?: string }) =>
  api<{ transaction: FinanceTransaction; balanceBeforePaise: number; balanceAfterPaise: number }>('/finance/adjustment', { method: 'POST', body })

export interface TransactionFilters {
  type?: string
  walletKey?: WalletKey
  categoryKey?: string
  necessity?: string
  source?: string
  date?: string
  from?: string | null
  to?: string | null
  limit?: number
  cursor?: string | null
}

export function getFinanceTransactions(filters: TransactionFilters = {}): Promise<TransactionPage> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return api<TransactionPage>(`/finance/transactions${qs ? `?${qs}` : ''}`)
}

export const postMoneyIn = (body: { amountPaise: number; walletKey: WalletKey; source?: string; date: string; note?: string; clientToken?: string }) =>
  api<{ transaction: FinanceTransaction; replayed: boolean; walletBalancePaise: number }>('/finance/money-in', { method: 'POST', body })

export const postExpense = (body: {
  item: string
  amountPaise: number
  categoryKey: string
  necessity: 'necessary' | 'optional' | 'wasteful'
  walletKey: WalletKey
  date: string
  note?: string
  clientToken?: string
}) => api<{ transaction: FinanceTransaction; replayed: boolean; walletBalancePaise: number }>('/finance/expenses', { method: 'POST', body })

export const editTransaction = (
  id: string,
  body: { amountPaise?: number; walletKey?: WalletKey; date?: string; item?: string; categoryKey?: string; necessity?: 'necessary' | 'optional' | 'wasteful'; source?: string; reason?: string; note?: string | null },
) => api<{ transaction: FinanceTransaction; walletBalancePaise: number }>(`/finance/transactions/${id}`, { method: 'PUT', body })

export const deleteTransaction = (id: string) => api<void>(`/finance/transactions/${id}`, { method: 'DELETE' })

export const getFinanceAnalytics = (query: string) => api<FinanceAnalytics>(`/finance/analytics${query}`)
export const getFinanceInsights = (query: string) => api<FinanceInsights>(`/finance/insights${query}`)
export const getDadReport = (query: string) => api<DadReport>(`/finance/reports/dad${query}`)

export const getLegacyPurchases = () => api<{ purchases: LegacyPurchase[] }>('/finance/legacy-purchases')
export const convertLegacyPurchase = (body: { date: string; index: number; walletKey: WalletKey; expectedItem?: string }) =>
  api<{ txn: FinanceTransaction | null; alreadyConverted: boolean; walletBalancePaise: number }>('/finance/legacy-purchases/convert', {
    method: 'POST',
    body,
  })

export const getFinanceVerify = () =>
  api<{ ok: boolean; wallets: { key: string; balancePaise: number; transactions: number }[]; issues: string[] }>('/finance/verify')