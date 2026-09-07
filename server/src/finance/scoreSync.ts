// Keeps day scores authoritative across the ledger integration (plan §0):
// when a ledger expense for a date is created/edited/removed, the score of
// that date's record (if any) is re-stamped from the merged purchase view.

import { DailyRecord } from '../models/DailyRecord'
import { HabitDefinition } from '../models/HabitDefinition'
import { ScoringConfig } from '../models/ScoringConfig'
import { computeScore, type ScoringConfigData } from '../services/scoring'
import { mergedPurchasesForDate } from './ledger'
import { DEFAULT_BASELINE, DEFAULT_THRESHOLDS } from '../seed/defaults'

export async function loadScoringConfig(userId: string): Promise<{ config: ScoringConfigData; labels: Record<string, string> }> {
  const [defs, cfg] = await Promise.all([
    HabitDefinition.find({ userId }).lean(),
    ScoringConfig.findOne({ userId }).lean(),
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
  return { config, labels }
}

/** Re-compute and store the score for a date's record, if one exists. */
export async function restampDayScore(userId: string, date: string): Promise<void> {
  const record = await DailyRecord.findOne({ userId, date })
  if (!record) return
  const { config, labels } = await loadScoringConfig(userId)
  const merged = await mergedPurchasesForDate(userId, date)
  const habits = record.habits.map((h) => ({
    habitKey: h.habitKey,
    status: h.status === 'completed' || h.status === 'not_completed' ? h.status : undefined,
    details: h.details ?? undefined,
    reason: h.reason ?? undefined,
  }))
  const purchases = merged.map((p) => ({
    item: p.item,
    amount: p.amount,
    category: p.category,
    necessary: p.necessary,
    notes: p.notes,
  }))
  const result = computeScore(config, habits, purchases, labels)
  await DailyRecord.updateOne(
    { _id: record._id },
    { $set: { score: result.score, quality: result.quality, scoreBreakdown: result.breakdown } },
  )
}
