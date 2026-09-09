import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MaggieStreakCard } from './SummaryCards'
import type { Streaks } from '../../api/types'

const streaks = (avoidCurrent: number, avoidBest = avoidCurrent): Streaks => ({
  tracking: { current: 1, best: 5 },
  habits: { study: { current: 2, best: 3 } },
  avoidHabits: { maggie: { current: avoidCurrent, best: avoidBest } },
})

describe('MaggieStreakCard', () => {
  it('shows the current avoid streak prominently', () => {
    render(<MaggieStreakCard streaks={streaks(6)} />)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('days')).toBeInTheDocument()
    expect(screen.getByText('Keep going — every day counts.')).toBeInTheDocument()
    expect(screen.getByText('Best: 6 days without Maggie')).toBeInTheDocument()
  })

  it('shows the start-today prompt at zero', () => {
    render(<MaggieStreakCard streaks={streaks(0)} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Start your streak today — skip the Maggie.')).toBeInTheDocument()
    expect(screen.queryByText(/Best:/)).not.toBeInTheDocument()
  })

  it('defaults to zero when the server omits avoidHabits (older payloads)', () => {
    render(<MaggieStreakCard streaks={{ tracking: { current: 1, best: 1 }, habits: {} }} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
