// Finance migration — ADDITIVE and IDEMPOTENT (plan §24).
//
//   1. BACK UP your database first (see README: MongoDB Atlas backup).
//   2. Run:  npm run migrate:finance --workspace server
//
// What it does:
//   - Creates the financetransactions collection indexes (no-ops if present).
//   - Prints per-collection document counts for verification.
// It never rewrites, deletes, or "fixes" existing documents. Safe to run again.

import 'dotenv/config'
import mongoose from 'mongoose'
import { FinanceTransaction } from '../src/finance/FinanceTransaction'
import { User } from '../src/models/User'
import { DailyRecord } from '../src/models/DailyRecord'
import { WeightEntry } from '../src/models/WeightEntry'
import { HabitDefinition } from '../src/models/HabitDefinition'
import { ScoringConfig } from '../src/models/ScoringConfig'

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/manoj_tracking'
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  console.log(`✓ Connected (${uri.replace(/\/\/.*@/, '//***@')})`)

  // Ensure indexes (syncIndexes creates missing ones only).
  await FinanceTransaction.syncIndexes()
  console.log('✓ financetransactions indexes ensured')

  const [users, records, weights, habits, scoring, txns] = await Promise.all([
    User.countDocuments(),
    DailyRecord.countDocuments(),
    WeightEntry.countDocuments(),
    HabitDefinition.countDocuments(),
    ScoringConfig.countDocuments(),
    FinanceTransaction.countDocuments(),
  ])
  console.log('Collection counts:')
  console.log(`  users               ${users}`)
  console.log(`  dailyrecords        ${records}`)
  console.log(`  weightentries       ${weights}`)
  console.log(`  habitdefinitions    ${habits}`)
  console.log(`  scoringconfigs      ${scoring}`)
  console.log(`  financetransactions ${txns}`)

  await mongoose.disconnect()
  console.log('✓ Migration complete (no existing data was modified)')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
