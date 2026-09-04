import { Router } from 'express'
import { User } from '../models/User'
import { DailyRecord } from '../models/DailyRecord'
import { WeightEntry } from '../models/WeightEntry'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user!.id
  const [user, habits, records, weightEntries, scoring] = await Promise.all([
    User.findById(userId).lean(),
    HabitDefinition.find({ userId }).sort({ order: 1 }).lean(),
    DailyRecord.find({ userId }).sort({ date: 1 }).lean(),
    WeightEntry.find({ userId }).sort({ date: 1 }).lean(),
    ScoringConfig.findOne({ userId }).lean(),
  ])
  res.setHeader('Content-Disposition', 'attachment; filename="manoj-tracking-export.json"')
  res.json({
    data: {
      exportedAt: new Date().toISOString(),
      user: user
        ? { id: String(user._id), email: user.email, name: user.name, settings: user.settings }
        : null,
      habits,
      records,
      weightEntries,
      scoring,
    },
  })
})

export default router