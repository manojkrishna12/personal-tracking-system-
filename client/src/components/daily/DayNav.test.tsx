import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import DayNav from './DayNav'

function LocationProbe({ onLocation }: { onLocation: (l: { pathname: string }) => void }) {
  const loc = useLocation()
  onLocation(loc)
  return null
}

function renderNav(onLocation: (l: { pathname: string }) => void) {
  return render(
    <MemoryRouter initialEntries={['/day/2026-09-11']}>
      <Routes>
        <Route path="/day/:date" element={<DayNav date="2026-09-11" />} />
        <Route path="/" element={<div>dashboard</div>} />
      </Routes>
      <LocationProbe onLocation={onLocation} />
    </MemoryRouter>,
  )
}

describe('DayNav back-to-dashboard control', () => {
  it('renders a Back to Dashboard control on the day page', () => {
    renderNav(() => undefined)
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toBeInTheDocument()
  })

  it('navigates to / when clicked (not history-back)', async () => {
    const user = userEvent.setup()
    const locations: { pathname: string }[] = []
    renderNav((l) => locations.push(l))
    await user.click(screen.getByRole('link', { name: 'Back to Dashboard' }))
    expect(locations.at(-1)?.pathname).toBe('/')
  })

  it('keeps previous/next day navigation working', async () => {
    const user = userEvent.setup()
    const locations: { pathname: string }[] = []
    renderNav((l) => locations.push(l))
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(locations.at(-1)?.pathname).toBe('/day/2026-09-12')
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    // DayNav is prop-driven: ±1 from 2026-09-11 regardless of current URL.
    expect(locations.at(-1)?.pathname).toBe('/day/2026-09-10')
  })
})
