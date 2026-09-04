import { Router } from 'express'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'
import { updateHabitsSchema } from '../validation/schemas'
import { validate } from '../middleware/validate'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req: AuthRequest, res) => {
  const habits = await HabitDefinition.find({ userId: req.user!.id }).sort({ order: 1 }).lean()
  res.json({
    data: {
      habits: habits.map((h) => ({
        key: h.key,
        label: h.label,
        order: h.order,
        type: h.type,
        weeklyGoal: h.weeklyGoal,
      })),
    },
  })
})

router.put('/', validate(updateHabitsSchema), async (req: AuthRequest, res) => {
  const userId = req.user!.id
  const body = req.body as { habits: { key: string; label: string; type?: 'boolean' | 'purchase'; order?: number; weeklyGoal?: { min: number | null; max: number | null } }[] }

  const existing = await HabitDefinition.find({ userId }).lean()
  const existingByKey = new Map(existing.map((h) => [h.key, h]))

  for (const h of body.habits) {
    const current = existingByKey.get(h.key)
    if (current) {
      await HabitDefinition.updateOne(
        { userId, key: h.key },
        {
          $set: {
            label: h.label,
            order: h.order ?? current.order,
            weeklyGoal: h.weeklyGoal ?? current.weeklyGoal,
          },
        },
      )
    } else {
      // New habit — defaults to a neutral positive scoring entry.
      await HabitDefinition.create({
        userId,
        key: h.key,
        label: h.label,
        type: h.type ?? 'boolean',
        order: h.order ?? existing.length,
        weeklyGoal: h.weeklyGoal ?? { min: null, max: null },
      })
    }
  }

  // Keep the scoring config in sync with the habit list (new habits get sensible defaults).
  const defs = await HabitDefinition.find({ userId }).sort({ order: 1 }).lean()
  const cfg = await ScoringConfig.findOne({ userId })
  if (cfg) {
    const cfgByKey = new Map(cfg.habits.map((h) => [h.habitKey, h]))
    cfg.set(
      'habits',
      defs.map(
        (d) =>
          cfgByKey.get(d.key) ?? {
            habitKey: d.key,
            enabled: true,
            direction: 'positive' as const,
            points: 10,
            cap: 10,
          },
      ),
    )
    await cfg.save()
  }

  const habits = await HabitDefinition.find({ userId }).sort({ order: 1 }).lean()
  res.json({
    data: {
      habits: habits.map((h) => ({
        key: h.key,
        label: h.label,
        order: h.order,
        type: h.type,
        weeklyGoal: h.weeklyGoal,
      })),
    },
  })
})

export default router