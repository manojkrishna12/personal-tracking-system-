import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteWeight,
  getDay,
  getHabits,
  getMe,
  getMonthDays,
  getMonthlyInsights,
  getScoringConfig,
  getSettings,
  getStreaks,
  getWeeklyInsights,
  getWeight,
  getYearReview,
  recomputeScores,
  saveDay,
  saveHabits,
  saveScoringConfig,
  saveSettings,
  saveWeight,
} from '../api/endpoints'
import type { HabitDef, Purchase, UserSettings } from '../api/types'

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 5 * 60 * 1000 })
}

export function useHabits() {
  return useQuery({ queryKey: ['habits'], queryFn: getHabits })
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: getSettings })
}

export function useScoringConfig() {
  return useQuery({ queryKey: ['scoring'], queryFn: getScoringConfig })
}

export function useMonthDays(month: string) {
  return useQuery({ queryKey: ['days', 'month', month], queryFn: () => getMonthDays(month) })
}

export function useDay(date: string) {
  return useQuery({ queryKey: ['day', date], queryFn: () => getDay(date) })
}

export function useWeight(limit = 500) {
  return useQuery({ queryKey: ['weight', limit], queryFn: () => getWeight(limit) })
}

export function useStreaks() {
  return useQuery({ queryKey: ['streaks'], queryFn: getStreaks })
}

export function useWeeklyInsights(date: string) {
  return useQuery({ queryKey: ['insights', 'weekly', date], queryFn: () => getWeeklyInsights(date) })
}

export function useMonthlyInsights(month: string) {
  return useQuery({ queryKey: ['insights', 'monthly', month], queryFn: () => getMonthlyInsights(month) })
}

export function useYearReview(year: string) {
  return useQuery({ queryKey: ['insights', 'year', year], queryFn: () => getYearReview(year) })
}

export function useSaveDay(date: string) {
  const qc = useQueryClient()
  const month = date.slice(0, 7)
  return useMutation({
    mutationFn: (body: { habits: { habitKey: string; status?: 'completed' | 'not_completed'; details?: string; reason?: string }[]; purchases: Purchase[] }) => saveDay(date, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day', date] })
      qc.invalidateQueries({ queryKey: ['days', 'month', month] })
      qc.invalidateQueries({ queryKey: ['streaks'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}

export function useSaveWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: { weightKg: number; note?: string } }) => saveWeight(date, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weight'] })
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}

export function useDeleteWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (date: string) => deleteWeight(date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weight'] }),
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: UserSettings) => saveSettings(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useSaveScoringConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveScoringConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring'] }),
  })
}

export function useRecomputeScores() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: recomputeScores,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['days'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}

export function useSaveHabits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (habits: Partial<HabitDef>[]) => saveHabits(habits),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] })
      qc.invalidateQueries({ queryKey: ['scoring'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}