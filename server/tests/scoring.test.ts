import { describe, expect, it } from 'vitest'
import { computeScore, type ScoringConfigData } from '../src/services/scoring'
import type { HabitEntryInput, PurchaseInput } from '../src/types'

const cfg: ScoringConfigData = {
  baseline: 60,
  habits: [
    { habitKey: 'protein', enabled: true, direction: 'positive', points: 10, cap: 10 },
    { habitKey: 'eatOutside', enabled: true, direction: 'negative', points: 10, cap: 10 },
    { habitKey: 'junkFood', enabled: true, direction: 'negative', points: 15, cap: 15 },
    { habitKey: 'maggie', enabled: true, direction: 'negative', points: 5, cap: 5 },
    { habitKey: 'study', enabled: true, direction: 'positive', points: 20, cap: 20 },
    { habitKey: 'gym', enabled: true, direction: 'positive', points: 20, cap: 20 },
    { habitKey: 'thingsBought', enabled: true, direction: 'negative', points: 8, cap: 20 },
  ],
  qualityThresholds: { excellent: 75, average: 50 },
}

const labels: Record<string, string> = {
  protein: 'Protein',
  eatOutside: 'Eat Outside',
  junkFood: 'Junk Food',
  maggie: 'Maggie',
  study: 'Study',
  gym: 'Gym',
  thingsBought: 'Things Bought',
}

const entry = (habitKey: string, status: 'completed' | 'not_completed'): HabitEntryInput => ({ habitKey, status })
const purchase = (necessary: boolean): PurchaseInput => ({
  item: 'Headphones',
  amount: 2499,
  category: 'Electronics',
  necessary,
})

describe('computeScore — three-state scoring', () => {
  it('computes a perfect day from the plan example (clamped to 100, excellent)', () => {
    const r = computeScore(
      cfg,
      [entry('protein', 'completed'), entry('eatOutside', 'not_completed'), entry('junkFood', 'not_completed'), entry('maggie', 'completed'), entry('study', 'completed'), entry('gym', 'completed')],
      [],
      labels,
    )
    expect(r.computed).toBe(true)
    expect(r.score).toBe(100)
    expect(r.quality).toBe('excellent')
  })

  it('gives a typical mixed day a mid score (67, average)', () => {
    const r = computeScore(
      cfg,
      [entry('study', 'completed'), entry('gym', 'completed'), entry('junkFood', 'completed'), entry('eatOutside', 'completed')],
      [purchase(false)],
      labels,
    )
    expect(r.score).toBe(67)
    expect(r.quality).toBe('average')
  })

  it('gives a bad day a low score (10, poor)', () => {
    const r = computeScore(cfg, [entry('junkFood', 'completed'), entry('eatOutside', 'completed'), entry('maggie', 'completed'), entry('gym', 'not_completed')], [], labels)
    expect(r.score).toBe(10)
    expect(r.quality).toBe('poor')
  })

  it('never scores an empty/untracked day', () => {
    const r = computeScore(cfg, [], [], labels)
    expect(r.computed).toBe(false)
    expect(r.score).toBeNull()
    expect(r.quality).toBeNull()
    expect(r.breakdown).toEqual([])
  })

  it('does not treat Not Recorded as ✗ — it is excluded entirely', () => {
    // Only junk food recorded: 60 − 15 = 45. Missing protein must not add any penalty.
    const recorded = computeScore(cfg, [entry('junkFood', 'completed')], [], labels)
    expect(recorded.score).toBe(45)
    // Same day but with protein explicitly ✗: 60 − 15 − 10 = 35.
    const missed = computeScore(cfg, [entry('junkFood', 'completed'), entry('protein', 'not_completed')], [], labels)
    expect(missed.score).toBe(35)
  })

  it('credits explicitly resisted negative habits (✗ on a negative = +points)', () => {
    const r = computeScore(cfg, [entry('junkFood', 'not_completed')], [], labels)
    expect(r.score).toBe(75)
    expect(r.quality).toBe('excellent')
  })

  it('caps unnecessary purchase penalties at the configured cap', () => {
    const one = computeScore(cfg, [], [purchase(false)], labels)
    const three = computeScore(cfg, [], [purchase(false), purchase(false), purchase(false)], labels)
    expect(one.score).toBe(52) // 60 − 8
    expect(three.score).toBe(40) // capped: 60 − 20
  })

  it('ignores necessary purchases', () => {
    const r = computeScore(cfg, [], [purchase(true)], labels)
    expect(r.score).toBe(60)
  })

  it('respects disabled habits', () => {
    const disabled: ScoringConfigData = {
      ...cfg,
      habits: cfg.habits.map((h) => (h.habitKey === 'junkFood' ? { ...h, enabled: false } : h)),
    }
    const r = computeScore(disabled, [entry('junkFood', 'completed')], [], labels)
    expect(r.score).toBe(60)
  })

  it('respects a changed baseline', () => {
    const shifted: ScoringConfigData = { ...cfg, baseline: 70 }
    const r = computeScore(shifted, [entry('study', 'completed')], [], labels)
    expect(r.score).toBe(90)
  })

  it('clamps score into 0–100', () => {
    const max = computeScore(cfg, [entry('protein', 'completed'), entry('study', 'completed'), entry('gym', 'completed'), entry('eatOutside', 'not_completed'), entry('junkFood', 'not_completed'), entry('maggie', 'not_completed')], [], labels)
    const min = computeScore(cfg, [entry('study', 'not_completed'), entry('gym', 'not_completed'), entry('protein', 'not_completed'), entry('junkFood', 'completed'), entry('eatOutside', 'completed'), entry('maggie', 'completed')], [purchase(false), purchase(false), purchase(false)], labels)
    expect(max.score).toBe(100)
    expect(min.score).toBe(0)
  })

  it('produces a readable breakdown including baseline and per-habit effects', () => {
    const r = computeScore(cfg, [entry('study', 'completed'), entry('junkFood', 'completed')], [], labels)
    const effects = Object.fromEntries(r.breakdown.map((b) => [b.habitKey, b.effect]))
    expect(effects['baseline']).toBe(60)
    expect(effects['study']).toBe(20)
    expect(effects['junkFood']).toBe(-15)
  })
})