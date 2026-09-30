import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Debts } from './Debts'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import type { Debt, DebtSummary } from '../api/types'

// Phase-4 tests: the read-only Debts page, its route, and its navigation
// entry. fetch is mocked at the boundary so every rendered number traces to
// an API response — nothing on the page is derived or invented.

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ data }) } as unknown as Response
}

const summary: DebtSummary = {
  totalOutstandingPaise: 250_000,
  outstandingCount: 2,
  people: [
    { person: 'Balaji', outstandingPaise: 150_000, debtCount: 1 },
    { person: 'Rahul', outstandingPaise: 100_000, debtCount: 1 },
  ],
}

const debts: Debt[] = [
  {
    _id: 'd1', person: 'Balaji', item: 'Gym membership', categoryKey: 'health', date: '2026-09-28',
    originalPaise: 150_000, repaidPaise: 0, transactionId: 't1', status: 'outstanding', note: null,
    createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z',
  },
  {
    _id: 'd2', person: 'Rahul', item: 'Dinner', categoryKey: 'outside_food', date: '2026-09-20',
    originalPaise: 100_000, repaidPaise: 0, transactionId: 't2', status: 'outstanding', note: null,
    createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z',
  },
]

// Well-formed finance overview for AppShell's wallets read.
const overview = { today: '2026-09-29', wallets: [], totalBalancePaise: 0, spent: { todayPaise: 0, weekPaise: 0, monthPaise: 0 } }

function fetchDebts() {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/debts/summary')) return Promise.resolve(ok(summary))
    if (String(url).includes('/debts')) return Promise.resolve(ok({ debts, summary }))
    if (String(url).includes('/finance/overview')) return Promise.resolve(ok(overview))
    return Promise.resolve(ok({}))
  })
}

function ui(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

/** Full-App render — mirrors main.tsx's provider stack. */
function uiApp(entries: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={entries}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Debts page', () => {
  it('shows the total outstanding from the summary API', async () => {
    fetchDebts()
    ui(<Debts />)
    await waitFor(() => expect(screen.getByText('Total you owe')).toBeInTheDocument())
    expect(screen.getByText('₹2,500')).toBeInTheDocument()
    expect(screen.getByText(/Across 2 people/)).toBeInTheDocument()
  })

  it('renders per-person outstanding amounts', async () => {
    fetchDebts()
    ui(<Debts />)
    await waitFor(() => expect(screen.getByText('Balaji')).toBeInTheDocument())
    expect(screen.getByText('Rahul')).toBeInTheDocument()
    expect(screen.getAllByText('outstanding').length).toBeGreaterThanOrEqual(2)
    // Person totals and per-debt rows share the same figures (1 debt each),
    // so amounts legitimately appear more than once.
    expect(screen.getAllByText('₹1,000').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('₹1,500').length).toBeGreaterThanOrEqual(2)
  })

  it('renders individual debt details (item, category, date, original, outstanding)', async () => {
    fetchDebts()
    ui(<Debts />)
    await waitFor(() => expect(screen.getByText('Gym membership')).toBeInTheDocument())
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByText(/Health · 2026-09-28/)).toBeInTheDocument()
    expect(screen.getByText(/Original ₹1,500/)).toBeInTheDocument()
    // Repaid ₹0 is omitted (nothing to show) — remaining appears in the
    // person total and the debt row alike.
    expect(screen.getAllByText('₹1,500').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the empty state with no fabricated data', async () => {
    fetchMock.mockImplementation((url: string) => {
      const empty = ok({ totalOutstandingPaise: 0, outstandingCount: 0, people: [] })
      if (String(url).includes('/debts/summary')) return Promise.resolve(empty)
      if (String(url).includes('/debts')) return Promise.resolve(ok({ debts: [], summary: empty }))
      return Promise.resolve(ok({}))
    })
    ui(<Debts />)
    await waitFor(() => expect(screen.getByText('No outstanding debts')).toBeInTheDocument())
    expect(screen.getByText('Shared expenses you owe will appear here.')).toBeInTheDocument()
    expect(screen.getByText('₹0')).toBeInTheDocument()
    expect(screen.queryByText('Balaji')).not.toBeInTheDocument()
  })

  it('shows a loading state while queries are in flight', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined)) // never resolves
    ui(<Debts />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows the error state with retry when an API fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/debts/summary')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: { code: 'X', message: 'boom' } }) } as unknown as Response)
      }
      if (String(url).includes('/debts')) return Promise.resolve(ok({ debts: [], summary: null }))
      return Promise.resolve(ok({}))
    })
    ui(<Debts />)
    await waitFor(() => expect(screen.getByText('Could not load your debts.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('/debts route and navigation', () => {
  it('renders via the /debts route through the full App', async () => {
    // Auth: App's RequireAuth gates on /auth/me; AppShell reads the overview.
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/auth/me')) return Promise.resolve(ok({ user: { id: 'u1', email: 'x@x.com', name: 'Manoj', settings: { weightGoalKg: 85, weekStartsOn: 1, timezone: 'Asia/Kolkata', theme: 'light' } } }))
      if (u.includes('/debts/summary')) return Promise.resolve(ok(summary))
      if (u.includes('/debts')) return Promise.resolve(ok({ debts, summary }))
      if (u.includes('/finance/overview')) return Promise.resolve(ok(overview))
      if (u.includes('/habits')) return Promise.resolve(ok({ habits: [] }))
      return Promise.resolve(ok({}))
    })
    uiApp(['/debts'])
    await waitFor(() => expect(screen.getByText('Total you owe')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText('₹2,500')).toBeInTheDocument()
  })

  it('navigation contains a Debts link to /debts', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/auth/me')) return Promise.resolve(ok({ user: { id: 'u1', email: 'x@x.com', name: 'Manoj', settings: { weightGoalKg: 85, weekStartsOn: 1, timezone: 'Asia/Kolkata', theme: 'light' } } }))
      if (u.includes('/debts/summary')) return Promise.resolve(ok(summary))
      if (u.includes('/debts')) return Promise.resolve(ok({ debts, summary }))
      if (u.includes('/finance/overview')) return Promise.resolve(ok(overview))
      if (u.includes('/habits')) return Promise.resolve(ok({ habits: [] }))
      return Promise.resolve(ok({}))
    })
    uiApp(['/debts'])
    const link = await screen.findByRole('link', { name: /debts/i }, { timeout: 3000 })
    expect(link).toHaveAttribute('href', '/debts')
  })

  it('mobile More sheet includes Debts', async () => {
    // Real interaction: open the shell at a mobile route, click the bottom-nav
    // More button, and assert the sheet lists Debts (same MORE_NAV source as
    // the desktop sidebar, so one contract drives both).
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/auth/me')) return Promise.resolve(ok({ user: { id: 'u1', email: 'x@x.com', name: 'Manoj', settings: { weightGoalKg: 85, weekStartsOn: 1, timezone: 'Asia/Kolkata', theme: 'light' } } }))
      if (u.includes('/finance/overview')) return Promise.resolve(ok(overview))
      return Promise.resolve(ok({}))
    })
    uiApp(['/money'])
    const moreBtn = await screen.findByRole('button', { name: 'More' }, { timeout: 3000 })
    fireEvent.click(moreBtn)
    expect(screen.getByRole('button', { name: 'Debts' })).toBeInTheDocument()
  })

  it('responsive classes: person cards use the two-column desktop grid', async () => {
    fetchDebts()
    ui(<Debts />)
    await waitFor(() => expect(screen.getByText('Balaji')).toBeInTheDocument())
    const grid = screen.getByText('Balaji').closest('div.grid')!
    expect(grid.className).toContain('lg:grid-cols-2')
    expect(grid.className).toContain('gap-4')
  })
})
