import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCountUp, usePrefersReducedMotion } from './motion'

// Deterministic rAF stub: fires the frame immediately with a timestamp past
// any realistic duration, so the animation completes on its first tick. This
// exercises the real count-up code path without depending on timing (jsdom
// has no rAF clock, and real timers flake under parallel test load).

function installInstantRaf(): () => void {
  const original = window.requestAnimationFrame
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(performance.now() + 60_000)
    return 0
  }) as typeof requestAnimationFrame
  return () => {
    window.requestAnimationFrame = original
  }
}

let restoreRaf: (() => void) | null = null
afterEach(() => {
  restoreRaf?.()
  restoreRaf = null
})

describe('usePrefersReducedMotion', () => {
  it('defaults to false when matchMedia reports no reduction', () => {
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })
})

describe('useCountUp', () => {
  it('starts at the exact target when animateOnMount is false', () => {
    const { result } = renderHook(() => useCountUp(77, 100, false))
    expect(result.current).toBe(77)
  })

  it('converges to the target value after an animated mount', () => {
    restoreRaf = installInstantRaf()
    const { result } = renderHook(() => useCountUp(50, 120, true))
    expect(result.current).toBe(50)
  })

  it('animates from the previous value to a new target', () => {
    restoreRaf = installInstantRaf()
    const { result, rerender } = renderHook(({ v }) => useCountUp(v, 120, false), { initialProps: { v: 10 } })
    expect(result.current).toBe(10)
    rerender({ v: 40 })
    expect(result.current).toBe(40)
  })
})
