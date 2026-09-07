import { z } from 'zod'
import { isValidDateString } from '../utils/dates'
import { CATEGORIES } from '../finance/registry'
import { MAX_TRANSACTION_PAISE } from '../finance/money'

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
  // Optional: the current client manages purchases in the finance ledger and
  // omits this field (embedded purchases are then preserved). A value sent by
  // a legacy client still replaces the day's embedded purchases.
  purchases: z.array(purchaseSchema).max(50).optional(),
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
 // Round-trips wallet alert thresholds — omitted means defaults apply.
  finance: z
    .object({
      alertThresholdPaise: z.object({
        cash: z.number().int().min(0).max(MAX_TRANSACTION_PAISE),
        phonepe: z.number().int().min(0).max(MAX_TRANSACTION_PAISE),
      }),
    })
    .optional(),
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

// ---------------------------------------------------------------------------
// Finance (plan §18). Money crosses the API as integer paise; dates are real
// calendar dates; future-dated financial transactions are rejected in routes.
// ---------------------------------------------------------------------------

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => isValidDateString(s), 'must be a valid YYYY-MM-DD date')

const walletKey = z.enum(['cash', 'phonepe'])

const positivePaise = z
  .number()
  .int()
  .positive()
  .max(MAX_TRANSACTION_PAISE)

const optionalToken = z.string().min(8).max(64).optional()

export const openingBalanceSchema = z.object({
  walletKey,
  amountPaise: z.number().int().min(0).max(MAX_TRANSACTION_PAISE),
  // Correction of an EXISTING opening balance requires the client to have
  // shown current → new → impact and confirmed (plan §7).
  acknowledged: z.boolean().optional(),
  previousAmountPaise: z.number().int().optional(),
  date: dateStr.optional(),
})

export const adjustmentSchema = z.object({
  walletKey,
  deltaPaise: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Adjustment cannot be zero')
    .refine((n) => Math.abs(n) <= MAX_TRANSACTION_PAISE, 'Adjustment too large'),
  // Required reason — a later real-world correction is a permanent ledger event.
  reason: z.string().trim().min(3).max(300),
  date: dateStr.optional(),
  clientToken: optionalToken,
})

export const moneyInSchema = z.object({
  amountPaise: positivePaise,
  walletKey,
  source: z.string().trim().min(1).max(60).default('Dad'),
  date: dateStr,
  note: z.string().max(500).optional(),
  clientToken: optionalToken,
})

export const expenseSchema = z.object({
  item: z.string().trim().min(1).max(80),
  amountPaise: positivePaise,
  categoryKey: z
    .string()
    .refine((k) => CATEGORIES.some((c) => c.key === k), 'Unknown category'),
  necessity: z.enum(['necessary', 'optional', 'wasteful']),
  walletKey,
  date: dateStr,
  note: z.string().max(500).optional(),
  clientToken: optionalToken,
})

export const transactionPatchSchema = z
  .object({
    amountPaise: z
      .number()
      .int()
      .refine((n) => n !== 0)
      .refine((n) => Math.abs(n) <= MAX_TRANSACTION_PAISE)
      .optional(),
    walletKey: walletKey.optional(),
    date: dateStr.optional(),
    item: z.string().trim().min(1).max(80).optional(),
    categoryKey: z
      .string()
      .refine((k) => CATEGORIES.some((c) => c.key === k))
      .optional(),
    necessity: z.enum(['necessary', 'optional', 'wasteful']).optional(),
    source: z.string().trim().min(1).max(60).optional(),
    reason: z.string().trim().min(3).max(300).optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes provided')

export const financeSettingsSchema = z.object({
  alertThresholdPaise: z.object({
    cash: z.number().int().min(0).max(MAX_TRANSACTION_PAISE),
    phonepe: z.number().int().min(0).max(MAX_TRANSACTION_PAISE),
  }),
})

export const convertLegacySchema = z.object({
  date: dateStr,
  index: z.number().int().min(0).max(50),
  walletKey,
  expectedItem: z.string().max(80).optional(),
})