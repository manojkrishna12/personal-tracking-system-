import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AnimatedNumber } from './ui'

// Deterministic rAF stub (see lib/motion.test.ts): the animated mount
// completes on its first frame, so these tests assert the real animation
// path without timing dependence. waitFor handles act-environment flushing.

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

describe('AnimatedNumber', () => {
  it('renders the exact value synchronously when animateOnMount is false', () => {
    render(<AnimatedNumber value={125000} format={(n) => `₹${n}`} />)
    expect(screen.getByText('₹125000')).toBeInTheDocument()
  })

  it('displays the exact real value after an animated mount', async () => {
    restoreRaf = installInstantRaf()
    render(<AnimatedNumber value={4200} format={(n) => `#${n}`} animateOnMount />)
    await waitFor(() => expect(screen.getByText('#4200')).toBeInTheDocument())
  })

  it('shows the new exact value after the target changes', async () => {
    restoreRaf = installInstantRaf()
    const { rerender } = render(<AnimatedNumber value={100} format={(n) => String(n)} animateOnMount />)
    rerender(<AnimatedNumber value={999} format={(n) => String(n)} animateOnMount />)
    await waitFor(() => expect(screen.getByText('999')).toBeInTheDocument())
  })
})
