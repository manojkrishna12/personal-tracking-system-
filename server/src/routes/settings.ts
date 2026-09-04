import { Router } from 'express'
import { User } from '../models/User'
import { DailyRecord } from '../models/DailyRecord'
import { ScoringConfig } from '../models/ScoringConfig'
import { HabitDefinition } from '../models/HabitDefinition'
import { computeScore, type ScoreBreakdownItem, type ScoringConfigData } from '../services/scoring'
import { scoringConfigSchema, settingsSchema } from '../validation/schemas'
import { validate } from '../middleware/validate'
import type { AuthRequest } from '../middleware/auth'
import { DEFAULT_BASELINE, DEFAULT_THRESHOLDS } from '../seed/defaults'

const router = Router()

router.get('/', async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.id)
  res.json({ data: { settings: user?.settings ?? null } })
})

router.put('/', validate(settingsSchema), async (req: AuthRequest, res) => {
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: { settings: req.body } }, { new: true })
  res.json({ data: { settings: user?.settings ?? null } })
})

router.get('/scoring', async (req: AuthRequest, res) => {
  const cfg = await ScoringConfig.findOne({ userId: req.user!.id }).lean()
  const data = cfg ?? {
    baseline: DEFAULT_BASELINE,
    habits: [],
    qualityThresholds: DEFAULT_THRESHOLDS,
  }
  res.json({
    data: {
      baseline: data.baseline,
      habits: data.habits,
      qualityThresholds: data.qualityThresholds,
    },
  })
})

router.put('/scoring', validate(scoringConfigSchema), async (req: AuthRequest, res) => {
  const cfg = await ScoringConfig.findOneAndUpdate(
    { userId: req.user!.id },
    { $set: req.body as ScoringConfigData },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  res.json({
    data: {
      baseline: cfg.baseline,
      habits: cfg.habits,
      qualityThresholds: cfg.qualityThresholds,
    },
  })
})

// Re-stamp every historical record with the current scoring config.
router.post('/scores/recompute', async (req: AuthRequest, res) => {
  const userId = req.user!.id
  const [defs, cfg, records] = await Promise.all([
    HabitDefinition.find({ userId }).lean(),
    ScoringConfig.findOne({ userId }).lean(),
    DailyRecord.find({ userId }).lean(),
  ])
  const labels: Record<string, string> = {}
  for (const d of defs) labels[d.key] = d.label
  const config: ScoringConfigData = {
    baseline: cfg?.baseline ?? DEFAULT_BASELINE,
    habits: (cfg?.habits ?? []).map((h) => ({
      habitKey: h.habitKey,
      enabled: h.enabled,
      direction: h.direction,
      points: h.points,
      cap: h.cap,
    })),
    qualityThresholds: {
      excellent: cfg?.qualityThresholds?.excellent ?? DEFAULT_THRESHOLDS.excellent,
      average: cfg?.qualityThresholds?.average ?? DEFAULT_THRESHOLDS.average,
    },
  }

  let recomputed = 0
  for (const record of records) {
    const habits = record.habits.map((h) => ({
      habitKey: h.habitKey,
      status: h.status === 'completed' || h.status === 'not_completed' ? h.status : undefined,
      details: h.details ?? undefined,
      reason: h.reason ?? undefined,
    }))
    const purchases = record.purchases.map((p) => ({
      item: p.item,
      amount: p.amount,
      category: p.category,
      necessary: p.necessary,
      notes: p.notes ?? undefined,
    }))
    const result = computeScore(config, habits, purchases, labels)
    await DailyRecord.updateOne(
      { _id: record._id },
      { $set: { score: result.score, quality: result.quality, scoreBreakdown: result.breakdown as ScoreBreakdownItem[] } },
    )
    recomputed++
  }
  res.json({ data: { recomputed } })
})

export default router