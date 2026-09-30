import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RepayDebtModal } from './RepayDebtModal'
import type { Debt, WalletKey } from '../../api/types'

// Phase-5 modal tests: the repay flow mirrors the server's rules client-side
// (validation + wallet-after preview) while the server stays authoritative.
// fetch is mocked at the boundary; every rendered number traces to API data.

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ data }) } as unknown as Response
}

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    _id: 'd1',
    person: 'Balaji',
    item: 'Gym membership',
    categoryKey: 'health',
    date: '2026-09-28',
    originalPaise: 150_000,
    repaidPaise: 0,
    transactionId: 't1',
    status: 'outstanding',
    note: null,
    createdAt: '2026-09-28T00:00:00Z',
    updatedAt: '2026-09-28T00:00:00Z',
    ...overrides,
  }
}

// ₹10,000 cash / ₹4,000 PhonePe — mirrors the seeded QA wallet reality.
const overview = {
  today: '2026-09-30',
  wallets: [
    { key: 'cash', label: 'Cash', balancePaise: 1_000_000, alertThresholdPaise: 0, low: false, hasOpeningBalance: true, openingBalancePaise: 1_000_000 },
    { key: 'phonepe', label: 'PhonePe', balancePaise: 400_000, alertThresholdPaise: 0, low: false, hasOpeningBalance: true, openingBalancePaise: 400_000 },
  ],
  totalBalancePaise: 1_400_000,
  spent: { todayPaise: 0, weekPaise: 0, monthPaise: 0 },
}

function ui(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/finance/overview')) return Promise.resolve(ok(overview))
    return Promise.resolve(ok({}))
  })
})

async function openModal(d = debt()) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  ui(<RepayDebtModal debt={d} onClose={onClose} onSaved={onSaved} />)
  await waitFor(() => expect(screen.getByLabelText(/Amount to repay/i)).toBeInTheDocument())
  return { onSaved, onClose }
}

/** Matches an element whose *full* textContent equals the given string (text split across inline nodes). */
function fullText(text: string) {
  return (_: string, el: Element | null) => el?.textContent === text
}

describe('RepayDebtModal', () => {
  it('shows person, item, outstanding, and defaults to the full outstanding amount', async () => {
    await openModal()
    expect(screen.getByText(/Balaji/)).toBeInTheDocument()
    expect(screen.getByText('Gym membership')).toBeInTheDocument()
    expect(screen.getByText(fullText('Outstanding ₹1,500'))).toBeInTheDocument() // summary box
    expect(screen.getByLabelText(/Amount to repay/i)).toHaveValue('1500.00')
  })

  it('previews remaining and wallet-after, and switches with the wallet selector', async () => {
    await openModal()
    // Cash selected by default: 10,000 − 1,500 = 8,500 (wait for the overview query)
    await waitFor(() => expect(screen.getByText(fullText('Cash after repayment: ₹8,500'))).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/Pay from/i), { target: { value: 'phonepe' } })
    expect(screen.getByText(fullText('PhonePe after repayment: ₹2,500'))).toBeInTheDocument()
  })

  it('partial amount updates the preview to show the remaining debt', async () => {
    await openModal()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: '500' } })
    expect(screen.getByText(fullText('Remaining after: ₹1,000'))).toBeInTheDocument()
    expect(screen.getByText(fullText('Cash after repayment: ₹9,500'))).toBeInTheDocument()
  })

  it('rejects an amount above the outstanding and blocks submit', async () => {
    const { onClose } = await openModal()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: '1500.01' } })
    expect(screen.getByText(/Cannot exceed the outstanding/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }))
    expect(onClose).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/repay'))).toHaveLength(0)
  })

  it('rejects zero/invalid amounts', async () => {
    const { onClose } = await openModal()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: '0' } })
    expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: 'abc' } })
    expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('warns when the selected wallet balance is too low and blocks submit', async () => {
    // Smaller PhonePe wallet (₹1,000) so a valid amount (≤ outstanding ₹1,500)
    // can still exceed it — the invalid branch takes precedence otherwise.
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/finance/overview')) {
        return Promise.resolve(ok({ ...overview, wallets: [overview.wallets[0], { ...overview.wallets[1], balancePaise: 100_000 }], totalBalancePaise: 1_100_000 }))
      }
      return Promise.resolve(ok({}))
    })
    const { onClose } = await openModal()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: '1200' } })
    fireEvent.change(screen.getByLabelText(/Pay from/i), { target: { value: 'phonepe' } })
    expect(screen.getByText(/balance too low/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers "Repay full" to restore the default after editing', async () => {
    await openModal()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: /Repay full ₹1,500/i }))
    expect(screen.getByLabelText(/Amount to repay/i)).toHaveValue('1500.00')
  })

  it('submits the repay request and closes on success (partial)', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/repay') && init?.method === 'POST') {
        return Promise.resolve(ok({ debt: debt({ repaidPaise: 50_000 }), replayed: false, settled: false, walletBalancePaise: 950_000 }))
      }
      if (String(url).includes('/finance/overview')) return Promise.resolve(ok(overview))
      return Promise.resolve(ok({}))
    })
    const { onSaved, onClose } = await openModal()
    fireEvent.change(screen.getByLabelText(/Amount to repay/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirm repayment/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/repay'))!
    expect(String(call[0])).toContain('/finance/debts/d1/repay')
    const body = JSON.parse(String(call[1]?.body))
    expect(body).toMatchObject({ amountPaise: 50_000, walletKey: 'cash' })
    expect(typeof body.clientToken).toBe('string')
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('Repaid ₹500 to Balaji'))
  })

  it('shows the full-repayment success message when settled', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/repay') && init?.method === 'POST') {
        return Promise.resolve(ok({ debt: debt({ repaidPaise: 150_000, status: 'settled' }), replayed: false, settled: true, walletBalancePaise: 850_000 }))
      }
      if (String(url).includes('/finance/overview')) return Promise.resolve(ok(overview))
      return Promise.resolve(ok({}))
    })
    const { onSaved, onClose } = await openModal()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('fully repaid'))
  })

  it('surfaces server errors without closing the modal', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/repay') && init?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient Cash balance' } }) } as unknown as Response)
      }
      if (String(url).includes('/finance/overview')) return Promise.resolve(ok(overview))
      return Promise.resolve(ok({}))
    })
    const { onClose } = await openModal()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }))
    await waitFor(() => expect(screen.getByText('Insufficient Cash balance')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel closes without any request', async () => {
    const { onClose } = await openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/repay'))).toHaveLength(0)
  })

  it('labels are programmatically associated (a11y contract)', async () => {
    await openModal()
    expect(screen.getByLabelText('Amount to repay (₹)')).toBeInTheDocument()
    expect(screen.getByLabelText('Pay from')).toBeInTheDocument()
  })
})
