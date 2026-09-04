import { api } from './client'
import type {
  DayRecord,
  HabitDef,
  MonthDay,
  MonthlyInsights,
  Purchase,
  ScoringConfig,
  Streaks,
  User,
  UserSettings,
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
  body: { habits: { habitKey: string; status?: 'completed' | 'not_completed'; details?: string; reason?: string }[]; purchases: Purchase[] },
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