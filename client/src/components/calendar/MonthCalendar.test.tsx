import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MonthCalendar from './MonthCalendar'

describe('MonthCalendar', () => {
  const days = [
    { date: '2026-09-04', score: 82, quality: 'excellent' as const },
    { date: '2026-09-05', score: 60, quality: 'average' as const },
    { date: '2026-09-06', score: 30, quality: 'poor' as const },
  ]

  it('renders weekday headers and the month label', () => {
    render(<MonthCalendar month="2026-09" days={days} today="2026-09-04" onSelect={() => undefined} />)
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(d)).toBeInTheDocument()
    }
  })

  it('marks tracked days with a quality dot and today with a ring', () => {
    render(<MonthCalendar month="2026-09" days={days} today="2026-09-04" onSelect={() => undefined} />)
    const todayCell = screen.getByTitle('2026-09-04 · 82')
    expect(todayCell).toHaveClass('ring-1')
    const goodDot = todayCell.querySelector('span:last-child') as HTMLElement
    expect(goodDot.style.background).toBe('var(--good)')
  })

  it('disables future dates and allows clicking a tracked past date', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MonthCalendar month="2026-09" days={[{ ...days[0]! }, { date: '2026-09-03', score: 55, quality: 'average' as const }, ...days.slice(1)]} today="2026-09-04" onSelect={onSelect} />)

    const futureCell = screen.getByTitle('2026-09-30')
    expect(futureCell).toBeDisabled()

    await user.click(screen.getByTitle('2026-09-03 · 55'))
    expect(onSelect).toHaveBeenCalledWith('2026-09-03')
  })
})