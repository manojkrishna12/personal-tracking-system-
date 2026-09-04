import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(60),
})

export const loginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
})

export const habitEntrySchema = z.object({
  habitKey: z.string().min(1).max(40),
  // status omitted → habit is cleared back to Not Recorded
  status: z.enum(['completed', 'not_completed']).optional(),
  details: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
})

export const purchaseSchema = z.object({
  item: z.string().min(1).max(80),
  amount: z.number().min(0).max(10_000_000),
  category: z.string().min(1).max(40),
  necessary: z.boolean(),
  notes: z.string().max(500).optional(),
})

export const saveDaySchema = z.object({
  habits: z.array(habitEntrySchema).max(50).default([]),
  purchases: z.array(purchaseSchema).max(50).default([]),
  // A client-supplied score is never accepted.
  score: z.never().optional(),
  quality: z.never().optional(),
})

export const weightSchema = z.object({
  weightKg: z.number().min(20).max(300),
  note: z.string().max(300).optional(),
})

export const scoringHabitSchema = z.object({
  habitKey: z.string().min(1).max(40),
  enabled: z.boolean(),
  direction: z.enum(['positive', 'negative']),
  points: z.number().min(0).max(100),
  cap: z.number().min(0).max(100),
})

export const scoringConfigSchema = z.object({
  baseline: z.number().min(0).max(100),
  habits: z.array(scoringHabitSchema).max(50),
  qualityThresholds: z.object({
    excellent: z.number().min(0).max(100),
    average: z.number().min(0).max(100),
  }),
})

export const settingsSchema = z.object({
  weightGoalKg: z.number().min(20).max(300),
  weekStartsOn: z.number().int().min(0).max(6),
  timezone: z.string().min(1).max(60),
  theme: z.enum(['light', 'dark']),
})

export const habitDefSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(40),
  type: z.enum(['boolean', 'purchase']).optional(),
  order: z.number().int().min(0).max(100).optional(),
  weeklyGoal: z
    .object({
      min: z.number().int().min(0).max(7).nullable().optional(),
      max: z.number().int().min(0).max(7).nullable().optional(),
    })
    .optional(),
})

export const updateHabitsSchema = z.object({
  habits: z.array(habitDefSchema).max(50),
})