import type { HabitEntryInput, PurchaseInput, Quality } from '../types'

export interface ScoringHabitCfg {
  habitKey: string
  enabled: boolean
  direction: 'positive' | 'negative'
  points: number
  cap: number
}

export interface ScoringConfigData {
  baseline: number
  habits: ScoringHabitCfg[]
  qualityThresholds: { excellent: number; average: number }
}

export interface ScoreBreakdownItem {
  habitKey: string
  label: string
  effect: number
}

export interface ScoreResult {
  computed: boolean
  score: number | null
  quality: Quality | null
  breakdown: ScoreBreakdownItem[]
}

/**
 * Three-state scoring — the authoritative implementation.
 *
 *   ✓ completed   → positive habit: +points · negative habit: −points
 *   ✗ not done    → positive habit: −points (recorded miss) · negative habit: +points (recorded resistance)
 *   Not Recorded  → excluded entirely, never penalized
 *
 * Unnecessary purchases each deduct `points` (capped at `cap`).
 *
 * A score is computed only when at least one habit is explicitly recorded or a
 * purchase exists. An empty/untracked day gets NO score and NO quality, so it
 * can never appear as 100/100.
 */
export function computeScore(
  config: ScoringConfigData,
  entries: HabitEntryInput[],
  purchases: PurchaseInput[],
  labels: Record<string, string>,
): ScoreResult {
  const hasRecorded = entries.some((e) => e.status !== undefined) || purchases.length > 0
  if (!hasRecorded) {
    return { computed: false, score: null, quality: null, breakdown: [] }
  }

  const byKey = new Map<string, ScoringHabitCfg>()
  for (const h of config.habits) if (h.enabled) byKey.set(h.habitKey, h)

  const entryByKey = new Map<string, HabitEntryInput>()
  for (const e of entries) if (e.status !== undefined) entryByKey.set(e.habitKey, e)

  const breakdown: ScoreBreakdownItem[] = [
    { habitKey: 'baseline', label: 'Baseline', effect: config.baseline },
  ]
  let total = config.baseline

  for (const [key, cfg] of byKey) {
    const entry = entryByKey.get(key)
    if (!entry) continue
    let effect = 0
    if (entry.status === 'completed') {
      effect = cfg.direction === 'positive' ? cfg.points : -cfg.points
    } else if (entry.status === 'not_completed') {
      effect = cfg.direction === 'positive' ? -cfg.points : cfg.points
    }
    // Maximum contribution per habit.
    effect = Math.max(-cfg.cap, Math.min(cfg.cap, effect))
    total += effect
    breakdown.push({ habitKey: key, label: labels[key] ?? key, effect })
  }

  // Purchase penalties are tied to the Things Bought habit's scoring config.
  const purchaseCfg = byKey.get('thingsBought')
  if (purchaseCfg) {
    const unnecessary = purchases.filter((p) => !p.necessary).length
    if (unnecessary > 0) {
      const penalty = Math.min(unnecessary * purchaseCfg.points, purchaseCfg.cap)
      total -= penalty
      breakdown.push({
        habitKey: 'thingsBought',
        label: labels['thingsBought'] ?? 'Things Bought',
        effect: -penalty,
      })
    }
  }

  const score = Math.max(0, Math.min(100, total))
  const { excellent, average } = config.qualityThresholds
  const quality: Quality = score >= excellent ? 'excellent' : score >= average ? 'average' : 'poor'
  return { computed: true, score, quality, breakdown }
}