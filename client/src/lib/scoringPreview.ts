/**
 * PREVIEW ONLY — a mirror of server/src/services/scoring.ts.
 *
 * The server is the sole authority: it recomputes, stores and returns the
 * score on every save. This copy is used only to show a live preview while
 * editing. Never treat its result as authoritative.
 */

export type HabitStatus = 'completed' | 'not_completed'

export interface PreviewHabitEntry {
  habitKey: string
  status?: HabitStatus
}

export interface PreviewPurchase {
  necessary: boolean
}

export interface PreviewScoringHabit {
  habitKey: string
  enabled: boolean
  direction: 'positive' | 'negative'
  points: number
  cap: number
}

export interface PreviewScoringConfig {
  baseline: number
  habits: PreviewScoringHabit[]
  qualityThresholds: { excellent: number; average: number }
}

export interface PreviewResult {
  computed: boolean
  score: number | null
  quality: 'excellent' | 'average' | 'poor' | null
}

export function previewScore(
  config: PreviewScoringConfig,
  entries: PreviewHabitEntry[],
  purchases: PreviewPurchase[],
): PreviewResult {
  const hasRecorded = entries.some((e) => e.status !== undefined) || purchases.length > 0
  if (!hasRecorded) return { computed: false, score: null, quality: null }

  const byKey = new Map<string, PreviewScoringHabit>()
  for (const h of config.habits) if (h.enabled) byKey.set(h.habitKey, h)

  let total = config.baseline
  for (const e of entries) {
    const cfg = byKey.get(e.habitKey)
    if (!cfg || e.status === undefined) continue
    let effect = 0
    if (e.status === 'completed') effect = cfg.direction === 'positive' ? cfg.points : -cfg.points
    else effect = cfg.direction === 'positive' ? -cfg.points : cfg.points
    effect = Math.max(-cfg.cap, Math.min(cfg.cap, effect))
    total += effect
  }

  const purchaseCfg = byKey.get('thingsBought')
  if (purchaseCfg) {
    const unnecessary = purchases.filter((p) => !p.necessary).length
    if (unnecessary > 0) total -= Math.min(unnecessary * purchaseCfg.points, purchaseCfg.cap)
  }

  const score = Math.max(0, Math.min(100, total))
  const { excellent, average } = config.qualityThresholds
  const quality = score >= excellent ? 'excellent' : score >= average ? 'average' : 'poor'
  return { computed: true, score, quality }
}