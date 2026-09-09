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

describe('computeStreaks — avoid (reverse-goal) streaks, e.g. Maggie', () => {
  it('one explicit ✗ day today → current 1', () => {
    const r = computeStreaks(['2026-09-04'], {}, '2026-09-04', { maggie: ['2026-09-04'] })
    expect(r.avoidHabits['maggie']!.current).toBe(1)
    expect(r.avoidHabits['maggie']!.best).toBe(1)
  })

  it('consecutive ✗ days increase the streak', () => {
    const r = computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
    })
    expect(r.avoidHabits['maggie']!.current).toBe(4)
    expect(r.avoidHabits['maggie']!.best).toBe(4)
  })

  it('an explicit ✓ day resets the avoid streak to 0 when it is today', () => {
    // ✗ ✗ ✓(today): the run ending today finds today not in the ✗ set.
    const r = computeStreaks(['2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-02', '2026-09-03'], // 09-04 is ✓
    })
    expect(r.avoidHabits['maggie']!.current).toBe(0)
    expect(r.avoidHabits['maggie']!.best).toBe(2)
  })

  it('✗ starts again at 1 after a ✓ day', () => {
    const r = computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-01', '2026-09-03', '2026-09-04'], // 09-02 was ✓
    })
    expect(r.avoidHabits['maggie']!.current).toBe(2)
    expect(r.avoidHabits['maggie']!.best).toBe(2)
  })

  it('editing a historical day changes the recalculated streak', () => {
    // Original: Sep 2 ✓ → streak since Sep 3 is 2. User edits Sep 2 → ✗: now 3.
    const before = computeStreaks(['2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-03', '2026-09-04'],
    })
    expect(before.avoidHabits['maggie']!.current).toBe(2)
    const afterEdit = computeStreaks(['2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-02', '2026-09-03', '2026-09-04'],
    })
    expect(afterEdit.avoidHabits['maggie']!.current).toBe(3)
    // Reverting the edit restores the original value.
    expect(computeStreaks(['2026-09-02', '2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-03', '2026-09-04'],
    }).avoidHabits['maggie']!.current).toBe(2)
  })

  it('a missing/unrecorded day breaks the avoid streak — silence is not success', () => {
    // ✗ on 01 and 03, nothing recorded on 02 → current is only 1.
    const r = computeStreaks(['2026-09-01', '2026-09-03'], {}, '2026-09-03', {
      maggie: ['2026-09-01', '2026-09-03'],
    })
    expect(r.avoidHabits['maggie']!.current).toBe(1)
    expect(r.avoidHabits['maggie']!.best).toBe(1)
  })

  it('today ✗ is included; today missing ends at yesterday\'s run', () => {
    const withToday = computeStreaks(['2026-09-03', '2026-09-04'], {}, '2026-09-04', {
      maggie: ['2026-09-03', '2026-09-04'],
    })
    expect(withToday.avoidHabits['maggie']!.current).toBe(2)
    const withoutToday = computeStreaks(['2026-09-03'], {}, '2026-09-04', {
      maggie: ['2026-09-03'],
    })
    expect(withoutToday.avoidHabits['maggie']!.current).toBe(0)
    expect(withoutToday.avoidHabits['maggie']!.best).toBe(1)
  })

  it('avoid streaks do not appear for keys with no ✗ days', () => {
    const r = computeStreaks(['2026-09-04'], { maggie: ['2026-09-04'] }, '2026-09-04', {})
    expect(r.avoidHabits['maggie']).toBeUndefined()
  })
})