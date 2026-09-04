import { Router } from 'express'
import { DailyRecord } from '../models/DailyRecord'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'
import { User } from '../models/User'
import { computeScore, type ScoreBreakdownItem, type ScoringConfigData } from '../services/scoring'
import { isFutureDate, isValidDateString, isValidMonthString, monthBounds, todayInTz } from '../utils/dates'
import { saveDaySchema } from '../validation/schemas'
import { validate } from '../middleware/validate'
import type { AuthRequest } from '../middleware/auth'
import type { HabitEntryInput, PurchaseInput } from '../types'

const router = Router()

async function loadScoringData(userId: string): Promise<{
  config: ScoringConfigData
  labels: Record<string, string>
  keys: Set<string>
}> {
  const [defs, cfg] = await Promise.all([
    HabitDefinition.find({ userId }).lean(),
    ScoringConfig.findOne({ userId }).lean(),
  ])
  const labels: Record<string, string> = {}
  const keys = new Set<string>()
  for (const d of defs) {
    labels[d.key] = d.label
    keys.add(d.key)
  }
  const config: ScoringConfigData = {
    baseline: cfg?.baseline ?? 60,
    habits: (cfg?.habits ?? []).map((h) => ({
      habitKey: h.habitKey,
      enabled: h.enabled,
      direction: h.direction,
      points: h.points,
      cap: h.cap,
    })),
    qualityThresholds: {
      excellent: cfg?.qualityThresholds?.excellent ?? 75,
      average: cfg?.qualityThresholds?.average ?? 50,
    },
  }
  return { config, labels, keys }
}

// Month summaries for the calendar — only tracked days.
router.get('/', async (req: AuthRequest, res) => {
  const month = String(req.query.month ?? '')
  if (!isValidMonthString(month)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'month must be YYYY-MM' } })
    return
  }
  const { start, end } = monthBounds(`${month}-01`)
  const days = await DailyRecord.find({ userId: req.user!.id, date: { $gte: start, $lte: end } })
    .select('date score quality')
    .lean()
  res.json({ data: { month, days } })
})

router.get('/:date', async (req: AuthRequest, res) => {
  const date = String(req.params.date)
  if (!isValidDateString(date)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be a valid YYYY-MM-DD' } })
    return
  }
  const record = await DailyRecord.findOne({ userId: req.user!.id, date }).lean()
  if (!record) {
    res.json({
      data: { date, habits: [], purchases: [], score: null, quality: null, scoreBreakdown: [] },
    })
    return
  }
  res.json({ data: record })
})

router.put('/:date', validate(saveDaySchema), async (req: AuthRequest, res) => {
  const date = String(req.params.date)
  if (!isValidDateString(date)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be a valid YYYY-MM-DD' } })
    return
  }
  const user = await User.findById(req.user!.id)
  if (!user) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } })
    return
  }
  const today = todayInTz(user.settings?.timezone ?? 'Asia/Kolkata')
  if (isFutureDate(date, today)) {
    res.status(400).json({ error: { code: 'FUTURE_DATE', message: 'Future dates cannot be recorded' } })
    return
  }

  const { config, labels, keys } = await loadScoringData(req.user!.id)
  const body = req.body as { habits: HabitEntryInput[]; purchases: PurchaseInput[] }

  for (const h of body.habits) {
    if (!keys.has(h.habitKey)) {
      res.status(400).json({
        error: { code: 'UNKNOWN_HABIT', message: `Unknown habit key: ${h.habitKey}` },
      })
      return
    }
  }

  // Only explicitly set habits are stored; omitted status clears the habit back to Not Recorded.
  const habits = body.habits
    .filter((h) => h.status !== undefined)
    .map((h) => ({
      habitKey: h.habitKey,
      status: h.status!,
      details: h.details ?? undefined,
      reason: h.reason ?? undefined,
    }))

  const record = await DailyRecord.findOneAndUpdate(
    { userId: req.user!.id, date },
    { $set: { habits, purchases: body.purchases } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const result = computeScore(config, habits, body.purchases, labels)
  await DailyRecord.updateOne(
    { _id: record._id },
    {
      $set: {
        score: result.score,
        quality: result.quality,
        scoreBreakdown: result.breakdown,
      },
    },
  )

  res.json({
    data: {
      date,
      score: result.score,
      quality: result.quality,
      scoreBreakdown: result.breakdown,
      habits: record.habits,
      purchases: record.purchases,
    },
  })
})

router.delete('/:date', async (req: AuthRequest, res) => {
  const date = String(req.params.date)
  if (!isValidDateString(date)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be a valid YYYY-MM-DD' } })
    return
  }
  const user = await User.findById(req.user!.id)
  if (!user) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } })
    return
  }
  if (isFutureDate(date, todayInTz(user.settings?.timezone ?? 'Asia/Kolkata'))) {
    res.status(400).json({ error: { code: 'FUTURE_DATE', message: 'Future dates cannot be modified' } })
    return
  }
  await DailyRecord.deleteOne({ userId: req.user!.id, date })
  res.status(204).end()
})

export default router