import type { Types } from 'mongoose'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'

export interface DefaultHabit {
  key: string
  label: string
  type: 'boolean' | 'purchase'
  weeklyGoal: { min: number | null; max: number | null }
}

// Seeded once per user on registration. Weekly goals come only from the
// user's own examples — everything else stays unset until configured.
export const DEFAULT_HABITS: DefaultHabit[] = [
  { key: 'protein', label: 'Protein', type: 'boolean', weeklyGoal: { min: 6, max: null } },
  { key: 'eatOutside', label: 'Eat Outside', type: 'boolean', weeklyGoal: { min: null, max: null } },
  { key: 'junkFood', label: 'Junk Food', type: 'boolean', weeklyGoal: { min: null, max: 2 } },
  { key: 'maggie', label: 'Maggie', type: 'boolean', weeklyGoal: { min: null, max: null } },
  { key: 'study', label: 'Study', type: 'boolean', weeklyGoal: { min: 6, max: null } },
  { key: 'gym', label: 'Gym', type: 'boolean', weeklyGoal: { min: 5, max: null } },
  { key: 'thingsBought', label: 'Things Bought', type: 'purchase', weeklyGoal: { min: null, max: null } },
]

export const DEFAULT_BASELINE = 60
export const DEFAULT_THRESHOLDS = { excellent: 75, average: 50 }

export const DEFAULT_SCORING = [
  { habitKey: 'protein', enabled: true, direction: 'positive', points: 10, cap: 10 },
  { habitKey: 'eatOutside', enabled: true, direction: 'negative', points: 10, cap: 10 },
  { habitKey: 'junkFood', enabled: true, direction: 'negative', points: 15, cap: 15 },
  { habitKey: 'maggie', enabled: true, direction: 'negative', points: 5, cap: 5 },
  { habitKey: 'study', enabled: true, direction: 'positive', points: 20, cap: 20 },
  { habitKey: 'gym', enabled: true, direction: 'positive', points: 20, cap: 20 },
  { habitKey: 'thingsBought', enabled: true, direction: 'negative', points: 8, cap: 20 },
] as const

export async function seedUserDefaults(userId: Types.ObjectId): Promise<void> {
  await HabitDefinition.insertMany(
    DEFAULT_HABITS.map((h, i) => ({
      userId,
      key: h.key,
      label: h.label,
      order: i,
      type: h.type,
      weeklyGoal: h.weeklyGoal,
    })),
  )
  await ScoringConfig.create({
    userId,
    baseline: DEFAULT_BASELINE,
    habits: DEFAULT_SCORING.map((h) => ({ ...h })),
    qualityThresholds: DEFAULT_THRESHOLDS,
  })
}