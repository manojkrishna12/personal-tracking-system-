import { Router } from 'express'
import { User } from '../models/User'
import { DailyRecord } from '../models/DailyRecord'
import { WeightEntry } from '../models/WeightEntry'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'
import { FinanceTransaction } from '../finance/FinanceTransaction'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user!.id
  const [user, habits, records, weightEntries, scoring, financeTransactions] = await Promise.all([
    User.findById(userId).lean(),
    HabitDefinition.find({ userId }).sort({ order: 1 }).lean(),
    DailyRecord.find({ userId }).sort({ date: 1 }).lean(),
    WeightEntry.find({ userId }).sort({ date: 1 }).lean(),
    ScoringConfig.findOne({ userId }).lean(),
    FinanceTransaction.find({ userId }).sort({ date: 1 }).lean(),
  ])
  res.setHeader('Content-Disposition', 'attachment; filename="selftrack-export.json"')
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
      financeTransactions,
    },
  })
})

export default router