import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddExpenseModal } from './AddExpenseModal'
import type { DebtPersonOption } from '../../api/types'

// Phase-3 tests: progressive disclosure of the shared-payment section. The
// debt-people hook is mocked (pure data); the add-expense mutation runs the
// real hook with fetch mocked so assertions cover the exact wire payload.

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const peopleMock = vi.hoisted(() => vi.fn())
vi.mock('../../hooks/useFinance', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useFinance')>('../../hooks/useFinance')
  return { ...actual, useDebtPeople: peopleMock }
})

function okResponse(data: unknown): Response {
  return { ok: true, status: 201, json: async () => ({ data }) } as unknown as Response
}

function renderModal(overrides: Partial<Parameters<typeof AddExpenseModal>[0]> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <AddExpenseModal
        date="2026-09-29"
        balances={{ cash: 100_000, phonepe: 50_000 }}
        thresholds={{ cash: 0, phonepe: 0 }}
        onClose={onClose}
        onSaved={onSaved}
        {...overrides}
      />
    </QueryClientProvider>,
  )
  return { onClose, onSaved, ...utils }
}

function openShared() {
  fireEvent.click(screen.getByRole('button', { name: /shared payment/i }))
}

function chooseArrangement(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { selector: 'input, textarea' }), { target: { value } })
}

beforeEach(() => {
  fetchMock.mockReset()
  peopleMock.mockReturnValue({ data: { people: [] }, isLoading: false })
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1–2: Disclosure.
// ---------------------------------------------------------------------------

describe('shared payment disclosure', () => {
  it('toggle OFF: no shared fields, normal form only', () => {
    renderModal()
    expect(screen.queryByText('Payment arrangement')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('My share ₹', { selector: 'input' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Item')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled()
  })

  it('toggle ON: arrangement section appears with Me preselected', () => {
    renderModal()
    openShared()
    expect(screen.getByText('Payment arrangement')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me', pressed: true })).toBeInTheDocument()
    expect(screen.getByText(/saved as a normal expense, no debt/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3–5: Arrangement previews.
// ---------------------------------------------------------------------------

describe('arrangement previews', () => {
  it('Me: no debt fields at all', () => {
    renderModal()
    openShared()
    expect(screen.queryByLabelText('My share ₹', { selector: 'input' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Paid by/i)).not.toBeInTheDocument()
  })

  it('Someone else: shows total as the share and the payer field', () => {
    renderModal()
    type('Item', 'Dinner')
    type('Amount ₹', '500')
    openShared()
    chooseArrangement('Someone else')
    // The total appears both as the read-only share and in the owe banner.
    expect(screen.getAllByText('₹500').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/Paid by/i)).toBeInTheDocument()
  })

  it('Someone else: live "You owe" preview once a payer is typed', () => {
    renderModal()
    type('Item', 'Dinner')
    type('Amount ₹', '500')
    openShared()
    chooseArrangement('Someone else')
    type('Paid by (person)', 'Balaji')
    const banner = screen.getByText(/You owe/i).textContent ?? ''
    expect(banner).toContain('₹500')
    expect(banner).toContain('Balaji')
  })

  it('Split: correct debt math (₹6,000 / ₹3,000 / ₹1,500 → owe ₹1,500)', () => {
    renderModal()
    type('Item', 'Gym membership')
    type('Amount ₹', '6000')
    openShared()
    chooseArrangement('Split')
    type('My share ₹', '3000')
    type('I paid ₹', '1500')
    type('Paid by (person)', 'Balaji')
    const banner = screen.getByText(/You owe/).textContent ?? ''
    expect(banner).toContain('₹3,000')
    expect(banner).toContain('₹1,500')
    expect(banner).toContain('Balaji')
  })
})

// ---------------------------------------------------------------------------
// 6–8: Validation.
// ---------------------------------------------------------------------------

describe('shared validation', () => {
  it('rejects my share > total', () => {
    renderModal()
    type('Item', 'X')
    type('Amount ₹', '1000')
    openShared()
    chooseArrangement('Split')
    type('My share ₹', '2000')
    type('Paid by (person)', 'Rahul')
    expect(screen.getByText('My share cannot exceed the total amount')).toBeInTheDocument()
  })

  it('rejects I paid > my share', () => {
    renderModal()
    type('Item', 'X')
    type('Amount ₹', '1000')
    openShared()
    chooseArrangement('Split')
    type('My share ₹', '500')
    type('I paid ₹', '800')
    type('Paid by (person)', 'Rahul')
    expect(screen.getByText('Amount paid cannot exceed my share')).toBeInTheDocument()
  })

  it('person required when a debt results', () => {
    renderModal()
    type('Item', 'Dinner')
    type('Amount ₹', '500')
    openShared()
    chooseArrangement('Someone else')
    expect(screen.getByText('Who paid the rest?')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 9–10: Submission payload + reset.
// ---------------------------------------------------------------------------

describe('shared submission', () => {
  it('sends the exact shared payload and closes', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        transaction: { _id: 't1', debtId: 'd1' },
        replayed: false,
        debt: { _id: 'd1', person: 'Balaji', originalPaise: 150_000 },
        walletBalancePaise: 55_000,
      }),
    )
    // Wallet covers the ₹1,500 out-of-pocket part.
    const { onSaved, onClose } = renderModal({ balances: { cash: 1_000_000, phonepe: 50_000 } })
    type('Item', 'Gym membership')
    type('Amount ₹', '6000')
    openShared()
    chooseArrangement('Split')
    type('My share ₹', '3000')
    type('I paid ₹', '1500')
    type('Paid by (person)', 'Balaji')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const sent = JSON.parse(init.body)
    expect(sent.shared).toEqual({ payer: 'Balaji', mySharePaise: 300_000, paidByMePaise: 150_000 })
    expect(sent.amountPaise).toBe(600_000)
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('You owe Balaji ₹1,500'))
  })

  it('normal expense (toggle OFF) sends no shared field', async () => {
    fetchMock.mockResolvedValue(okResponse({ transaction: { _id: 't2' }, replayed: false, debt: null, walletBalancePaise: 97_000 }))
    const { onSaved } = renderModal()
    type('Item', 'Bus ticket')
    type('Amount ₹', '150')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect('shared' in JSON.parse(init.body)).toBe(false)
  })

  it('Me arrangement sends no shared field either', async () => {
    fetchMock.mockResolvedValue(okResponse({ transaction: { _id: 't3' }, replayed: false, debt: null, walletBalancePaise: 97_000 }))
    const { onSaved } = renderModal()
    type('Item', 'Coffee')
    type('Amount ₹', '60')
    openShared()
    chooseArrangement('Me')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect('shared' in JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)).toBe(false)
  })

  it('resets the shared section after a successful save', async () => {
    fetchMock.mockResolvedValue(okResponse({ transaction: { _id: 't4' }, replayed: false, debt: null, walletBalancePaise: 0 }))
    const { onClose } = renderModal()
    type('Item', 'Dinner')
    type('Amount ₹', '500')
    openShared()
    chooseArrangement('Someone else')
    type('Paid by (person)', 'Rahul')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    // State was reset — reopening shows Me preselected and no stale payer.
    openShared()
    expect(screen.getByRole('button', { name: 'Me', pressed: true })).toBeInTheDocument()
    expect(screen.getByText(/saved as a normal expense, no debt/i)).toBeInTheDocument()
  })

  it('backend rejection shows the error and keeps entered values (no partial save)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient Cash balance' } }),
    } as unknown as Response)
    // Wallet covers the out-of-pocket part so the server's 409 is what shows.
    const { onClose } = renderModal({ balances: { cash: 1_000_000, phonepe: 50_000 } })
    type('Item', 'Gym membership')
    type('Amount ₹', '6000')
    openShared()
    chooseArrangement('Split')
    type('My share ₹', '3000')
    type('I paid ₹', '1500')
    type('Paid by (person)', 'Balaji')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(screen.getByText('Insufficient Cash balance')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('My share ₹')).toHaveValue('3000')
  })
})

// ---------------------------------------------------------------------------
// 11–12: Autocomplete + mobile overflow.
// ---------------------------------------------------------------------------

describe('payer autocomplete and layout', () => {
  it('offers known people via the datalist', () => {
    peopleMock.mockReturnValue({
      data: { people: [{ person: 'Balaji', outstandingPaise: 150_000 }, { person: 'Rahul', outstandingPaise: 50_000 }] as DebtPersonOption[] },
      isLoading: false,
    })
    renderModal()
    openShared()
    chooseArrangement('Someone else')
    // The modal renders through a portal, so query the document, not the container.
    const options = [...document.querySelectorAll('#debt-people-options option')] as HTMLOptionElement[]
    expect(options.map((o) => o.value)).toContain('Balaji')
    expect(options.map((o) => o.value)).toContain('Rahul')
  })

  it('shared section does not overflow horizontally at iPhone width', () => {
    renderModal()
    openShared()
    chooseArrangement('Split')
    const section = screen.getByText('Payment arrangement').parentElement!
    expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth + 1)
  })

  it('Split uses a responsive 2-column grid for share/paid (stacks on mobile)', () => {
    renderModal()
    openShared()
    chooseArrangement('Split')
    const share = screen.getByLabelText('My share ₹')
    const grid = share.closest('div.grid')!
    // Single column by default (phones), two columns from the sm breakpoint up.
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('sm:grid-cols-2')
    // Payer stays outside the grid — full width underneath.
    expect(grid.contains(screen.getByLabelText(/Paid by/i))).toBe(false)
    // Someone else keeps its standalone (non-grid) read-only share — no input.
    chooseArrangement('Someone else')
    expect(document.getElementById('expense-my-share')).toBeNull()
    expect(screen.getByText(/\(the full amount\)/)).toBeInTheDocument()
  })
})
