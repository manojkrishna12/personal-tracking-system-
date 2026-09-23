import { useEffect, useRef, useState } from 'react'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Reactive prefers-reduced-motion flag. Falls back to "no reduction" when
 * matchMedia is unavailable (old jsdom/SSR), which callers handle anyway.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REDUCED_QUERY).matches === true,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(REDUCED_QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    setReduced(mq.matches)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

/**
 * Count-up animation toward `target`: previous → target on change, and
 * 0 → target on mount when `animateOnMount` is true. Snaps straight to the
 * target under prefers-reduced-motion. Purely presentational — callers keep
 * using the real API value for logic.
 */
export function useCountUp(target: number, durationMs = 750, animateOnMount = true): number {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(() =>
    reduced || !animateOnMount ? target : 0,
  )
  const displayRef = useRef(display)
  displayRef.current = display

  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      setDisplay(target)
      return
    }
    const from = displayRef.current
    if (from === target) return
    let raf = 0
    let cancelled = false
    const start = performance.now()
    const tick = (now: number) => {
      if (cancelled) return
      const t = Math.min(1, (now - start) / durationMs)
      setDisplay(Math.round(from + (target - from) * easeOutCubic(t)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // Safety net: always snap to the exact target shortly after the duration.
    // Covers rAF-less/throttled environments and guarantees the displayed
    // value ends up identical to the real one.
    const settle = window.setTimeout(() => {
      if (!cancelled) setDisplay(target)
    }, durationMs + 150)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [target, reduced, durationMs])

  return display
}
