import { describe, expect, it } from 'vitest'
import { computeStreaks } from '../src/services/streaks'

describe('computeStreaks — strict, no grace', () => {
  it('current tracking streak is 0 when today is not recorded', () => {
    const r = computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03'], {}, '2026-09-04')
    expect(r.tracking.current).toBe(0)
    expect(r.tracking.best).toBe(3)
  })

  it('current tracking streak counts consecutive days ending today', () => {
    const r = computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04')
    expect(r.tracking.current).toBe(4)
  })

  it('a gap breaks the streak and limits the best run', () => {
    const r = computeStreaks(['2026-09-01', '2026-09-03', '2026-09-04'], {}, '2026-09-04')
    expect(r.tracking.current).toBe(2)
    expect(r.tracking.best).toBe(2)
  })

  it('habit streaks count only consecutive ✓ days', () => {
    const r = computeStreaks([], { study: ['2026-09-01', '2026-09-02', '2026-09-03'] }, '2026-09-04')
    expect(r.habits['study']!.current).toBe(0) // today not ✓
    expect(r.habits['study']!.best).toBe(3)
  })

  it('a ✗ or missing day breaks a habit streak even when tracking continues', () => {
    const r = computeStreaks(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
      { study: ['2026-09-01', '2026-09-02', '2026-09-04'] }, // gap on 09-03
      '2026-09-04',
    )
    expect(r.tracking.current).toBe(4)
    expect(r.habits['study']!.current).toBe(1)
    expect(r.habits['study']!.best).toBe(2)
  })

  it('handles unsorted input dates', () => {
    const r = computeStreaks(['2026-09-04', '2026-09-02', '2026-09-03'], {}, '2026-09-04')
    expect(r.tracking.current).toBe(3)
    expect(r.tracking.best).toBe(3)
  })
})