import { Router } from 'express'
import { WeightEntry } from '../models/WeightEntry'
import { User } from '../models/User'
import { isFutureDate, isValidDateString, todayInTz } from '../utils/dates'
import { weightSchema } from '../validation/schemas'
import { validate } from '../middleware/validate'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req: AuthRequest, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 30) || 30, 1), 500)
  const entries = await WeightEntry.find({ userId: req.user!.id }).sort({ date: -1 }).limit(limit).lean()
  res.json({ data: { entries } })
})

router.put('/:date', validate(weightSchema), async (req: AuthRequest, res) => {
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
    res.status(400).json({ error: { code: 'FUTURE_DATE', message: 'Future dates cannot be recorded' } })
    return
  }
  const { weightKg, note } = req.body as { weightKg: number; note?: string }
  const entry = await WeightEntry.findOneAndUpdate(
    { userId: req.user!.id, date },
    { $set: { weightKg, note: note ?? null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  res.json({ data: { entry } })
})

router.delete('/:date', async (req: AuthRequest, res) => {
  const date = String(req.params.date)
  if (!isValidDateString(date)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be a valid YYYY-MM-DD' } })
    return
  }
  await WeightEntry.deleteOne({ userId: req.user!.id, date })
  res.status(204).end()
})

export default router