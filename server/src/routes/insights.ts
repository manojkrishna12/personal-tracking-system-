import { Router } from 'express'
import { DailyRecord } from '../models/DailyRecord'
import { WeightEntry } from '../models/WeightEntry'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'
import { User } from '../models/User'
import { computeStreaks } from '../services/streaks'
import {
  computeMonthlyInsights,
  computeWeeklyInsights,
  computeYearReview,
  type Directions,
  type HabitDefLike,
  type RecordLike,
  type WeightLike,
} from '../services/insights'
import {
  addDaysStr,
  isValidDateString,
  isValidMonthString,
  monthBounds,
  todayInTz,
  weekBounds,
  YEAR_RE,
  yearBounds,
} from '../utils/dates'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

async function loadHabitContext(userId: string): Promise<{
  defs: HabitDefLike[]
  directions: Directions
}> {
  const [defs, cfg] = await Promise.all([
    HabitDefinition.find({ userId }).sort({ order: 1 }).lean(),
    ScoringConfig.findOne({ userId }).lean(),
  ])
  const directions: Directions = {}
  for (const h of cfg?.habits ?? []) directions[h.habitKey] = h.direction
  return {
    defs: defs.map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      weeklyGoal: { min: d.weeklyGoal?.min ?? null, max: d.weeklyGoal?.max ?? null },
    })),
    directions,
  }
}

router.get('/streaks', async (req: AuthRequest, res) => {
  const userId = req.user!.id
  const user = await User.findById(userId)
  const records = await DailyRecord.find({ userId }).select('date habits').lean()
  const recorded = records.map((r) => r.date)
  const habitCompletedDates: Record<string, string[]> = {}
  for (const r of records) {
    for (const h of r.habits) {
      if (h.status === 'completed') (habitCompletedDates[h.habitKey] ??= []).push(r.date)
    }
  }
  const today = todayInTz(user?.settings?.timezone ?? 'Asia/Kolkata')
  const result = computeStreaks(recorded, habitCompletedDates, today)
  res.json({ data: result })
})

router.get('/weekly', async (req: AuthRequest, res) => {
  const date = String(req.query.date ?? '')
  if (!isValidDateString(date)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be a valid YYYY-MM-DD' } })
    return
  }
  const userId = req.user!.id
  const user = await User.findById(userId)
  const weekStartsOn = (user?.settings?.weekStartsOn ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const { start, end } = weekBounds(date, weekStartsOn)
  const prevStart = addDaysStr(start, -7)
  const prevEnd = addDaysStr(end, -7)
  const [records, prevWeekRecords, { defs, directions }] = await Promise.all([
    DailyRecord.find({ userId, date: { $gte: start, $lte: end } }).lean() as Promise<RecordLike[]>,
    DailyRecord.find({ userId, date: { $gte: prevStart, $lte: prevEnd } }).lean() as Promise<RecordLike[]>,
    loadHabitContext(userId),
  ])
  const result = computeWeeklyInsights({ records, prevWeekRecords, habitDefs: defs, directions, weekStart: start, weekEnd: end })
  res.json({ data: result })
})

router.get('/monthly', async (req: AuthRequest, res) => {
  const month = String(req.query.month ?? '')
  if (!isValidMonthString(month)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'month must be YYYY-MM' } })
    return
  }
  const userId = req.user!.id
  const { start, end } = monthBounds(`${month}-01`)
  const [records, { directions }] = await Promise.all([
    DailyRecord.find({ userId, date: { $gte: start, $lte: end } }).lean() as Promise<RecordLike[]>,
    loadHabitContext(userId),
  ])
  const result = computeMonthlyInsights(month, records, directions)
  res.json({ data: result })
})

router.get('/year', async (req: AuthRequest, res) => {
  const year = String(req.query.year ?? '')
  if (!YEAR_RE.test(year)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'year must be YYYY' } })
    return
  }
  const userId = req.user!.id
  const { start, end } = yearBounds(year)
  const [records, weightEntries, { defs, directions }] = await Promise.all([
    DailyRecord.find({ userId, date: { $gte: start, $lte: end } }).lean() as Promise<RecordLike[]>,
    WeightEntry.find({ userId, date: { $gte: start, $lte: end } }).lean() as Promise<WeightLike[]>,
    loadHabitContext(userId),
  ])
  const result = computeYearReview({ year, records, weightEntries, habitDefs: defs, directions })
  res.json({ data: result })
})

export default router