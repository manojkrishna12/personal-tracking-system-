import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { User } from '../src/models/User'
import { DailyRecord } from '../src/models/DailyRecord'
import { WeightEntry } from '../src/models/WeightEntry'
import { seedUserDefaults } from '../src/seed/defaults'
import { computeScore } from '../src/services/scoring'
import { DEFAULT_HABITS, DEFAULT_SCORING, DEFAULT_BASELINE, DEFAULT_THRESHOLDS } from '../src/seed/defaults'
import { addDaysStr, todayInTz } from '../src/utils/dates'
import { env } from '../src/config/env'

const EMAIL = 'demo@manoj.local'
const PASSWORD = 'demo12345'
const NAME = 'Demo'

function chance(p: number): boolean {
  return Math.random() < p
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

const GYM_DETAILS = ['Chest + shoulders', 'Back + biceps', 'Legs', 'Push day', 'Pull day', 'Full body']
const STUDY_DETAILS = ['DSA - 2 hours', 'System design - 1 hour', 'DSA - 90 min', 'Revision - 1 hour', 'DevOps - 45 min']
const PROTEIN_DETAILS = ['6 eggs + paneer', 'Chicken + whey', 'Paneer + milk', 'Dal + 4 eggs', 'Soya + curd']
const ITEMS = [
  { item: 'Headphones', amount: 2499, category: 'Electronics', necessary: true },
  { item: 'Protein powder', amount: 1850, category: 'Health', necessary: true },
  { item: 'Chips', amount: 40, category: 'Food', necessary: false },
  { item: 'T-shirt', amount: 699, category: 'Clothing', necessary: false },
  { item: 'Rice bag', amount: 620, category: 'Groceries', necessary: true },
]

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri)

  const existing = await User.findOne({ email: EMAIL })
  if (existing) {
    await User.deleteOne({ _id: existing._id })
    await DailyRecord.deleteMany({ userId: existing._id })
    await WeightEntry.deleteMany({ userId: existing._id })
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const user = await User.create({ email: EMAIL, passwordHash, name: NAME })
  await seedUserDefaults(user._id)

  const labels = Object.fromEntries(DEFAULT_HABITS.map((h) => [h.key, h.label]))
  const config = {
    baseline: DEFAULT_BASELINE,
    habits: DEFAULT_SCORING.map((h) => ({ ...h })),
    qualityThresholds: DEFAULT_THRESHOLDS,
  }

  const today = todayInTz('Asia/Kolkata')
  let weight = 90

  for (let i = 90; i >= 1; i--) {
    const date = addDaysStr(today, -i)
    const weekday = new Date(`${date}T00:00:00`).getDay() // 0 Sun … 6 Sat
    const habits: { habitKey: string; status: 'completed' | 'not_completed'; details?: string }[] = []

    if (chance(0.55) || weekday === 2 || weekday === 4) {
      habits.push({ habitKey: 'gym', status: 'completed', ...(chance(0.9) ? { details: pick(GYM_DETAILS) } : {}) })
    } else if (chance(0.15)) {
      habits.push({ habitKey: 'gym', status: 'not_completed' })
    }

    if (chance(0.68)) {
      habits.push({ habitKey: 'study', status: 'completed', ...(chance(0.9) ? { details: pick(STUDY_DETAILS) } : {}) })
    } else if (chance(0.12)) {
      habits.push({ habitKey: 'study', status: 'not_completed' })
    }

    if (chance(0.7)) {
      habits.push({ habitKey: 'protein', status: 'completed', ...(chance(0.85) ? { details: pick(PROTEIN_DETAILS) } : {}) })
    } else if (chance(0.15)) {
      habits.push({ habitKey: 'protein', status: 'not_completed' })
    }

    if (chance(0.28)) habits.push({ habitKey: 'junkFood', status: 'completed' })
    else if (chance(0.2)) habits.push({ habitKey: 'junkFood', status: 'not_completed' })

    if (chance(0.3)) habits.push({ habitKey: 'eatOutside', status: 'completed' })
    else if (chance(0.15)) habits.push({ habitKey: 'eatOutside', status: 'not_completed' })

    if (chance(0.14)) habits.push({ habitKey: 'maggie', status: 'completed' })
    else if (chance(0.1)) habits.push({ habitKey: 'maggie', status: 'not_completed' })

    const purchases = chance(0.07) ? [pick(ITEMS)] : []

    const result = computeScore(config, habits, purchases, labels)
    await DailyRecord.create({
      userId: user._id,
      date,
      habits,
      purchases,
      score: result.score,
      quality: result.quality,
      scoreBreakdown: result.breakdown,
    })

    // Weekly weigh-ins trending down.
    if (i % 7 === 0) {
      weight = Math.max(86, weight - 0.4 - Math.random() * 0.3)
      await WeightEntry.create({ userId: user._id, date, weightKg: Math.round(weight * 10) / 10, note: 'gym' })
    }
  }

  const tracked = await DailyRecord.countDocuments({ userId: user._id })
  console.log(`✓ Seeded demo data: ${tracked} daily records, ~13 weight entries`)
  console.log(`  Email: ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})