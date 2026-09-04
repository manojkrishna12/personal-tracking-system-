import { describe, expect, it } from 'vitest'
import { previewScore, type PreviewScoringConfig } from './scoringPreview'

const cfg: PreviewScoringConfig = {
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

describe('previewScore (mirror of the server formula)', () => {
  it('matches the plan example: perfect day → 100 excellent', () => {
    const r = previewScore(cfg, [
      { habitKey: 'protein', status: 'completed' },
      { habitKey: 'eatOutside', status: 'not_completed' },
      { habitKey: 'junkFood', status: 'not_completed' },
      { habitKey: 'maggie', status: 'completed' },
      { habitKey: 'study', status: 'completed' },
      { habitKey: 'gym', status: 'completed' },
    ], [])
    expect(r).toEqual({ computed: true, score: 100, quality: 'excellent' })
  })

  it('matches the plan example: mixed day → 67 average', () => {
    const r = previewScore(cfg, [
      { habitKey: 'study', status: 'completed' },
      { habitKey: 'gym', status: 'completed' },
      { habitKey: 'junkFood', status: 'completed' },
      { habitKey: 'eatOutside', status: 'completed' },
    ], [{ necessary: false }])
    expect(r.score).toBe(67)
    expect(r.quality).toBe('average')
  })

  it('never previews a score for an empty day', () => {
    expect(previewScore(cfg, [], [])).toEqual({ computed: false, score: null, quality: null })
  })

  it('treats Not Recorded as neutral', () => {
    const onlyJunk = previewScore(cfg, [{ habitKey: 'junkFood', status: 'completed' }], [])
    const missedProtein = previewScore(cfg, [
      { habitKey: 'junkFood', status: 'completed' },
      { habitKey: 'protein', status: 'not_completed' },
    ], [])
    expect(onlyJunk.score).toBe(45)
    expect(missedProtein.score).toBe(35)
  })
})