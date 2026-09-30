import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { getDebtPeople, getDebts, getDebtsSummary, postExpense } from './endpoints'
import { useAddExpense, useDebtPeople, useDebts, useDebtsSummary } from '../hooks/useFinance'
import type { Debt, DebtSummary, FinanceTransaction } from './types'

// Phase-2 plumbing tests: endpoint serialization (fetch mocked), hook wiring,
// and proof that the existing finance hook behavior is unaffected.

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

function okResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ data }) } as unknown as Response
}

const txn: Pick<FinanceTransaction, '_id'> = { _id: 't1' }
const debt: Debt = {
  _id: 'd1',
  person: 'Rahul',
  item: 'Dinner',
  categoryKey: 'outside_food',
  date: '2026-09-29',
  originalPaise: 50_000,
  repaidPaise: 0,
  transactionId: 't1',
  status: 'outstanding',
  note: null,
  createdAt: '2026-09-29T00:00:00Z',
  updatedAt: '2026-09-29T00:00:00Z',
}
const summary: DebtSummary = {
  totalOutstandingPaise: 50_000,
  outstandingCount: 1,
  people: [{ person: 'Rahul', outstandingPaise: 50_000, debtCount: 1 }],
}

function wrapper(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('debt endpoints (serialization)', () => {
  it('GET /debts forwards status/person/limit as query params', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ debts: [debt], summary }))
    await getDebts({ status: 'outstanding', person: 'Rahul', limit: 50 })
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/finance/debts?status=outstanding&person=Rahul&limit=50')
  })

  it('GET /debts omits empty filters', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ debts: [], summary }))
    await getDebts()
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/finance/debts')
  })

  it('GET /debts/summary hits the summary route', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(summary))
    await getDebtsSummary()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/finance/debts/summary')
  })

  it('GET /debts/people hits the people route', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ people: [{ person: 'Rahul', outstandingPaise: 50_000 }] }))
    await getDebtPeople()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/finance/debts/people')
  })

  it('postExpense sends the optional shared block verbatim', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ transaction: txn, replayed: false, debt, walletBalancePaise: 150_000 }))
    const body = {
      item: 'Gym membership',
      amountPaise: 600_000,
      categoryKey: 'health',
      necessity: 'necessary' as const,
      walletKey: 'cash' as const,
      date: '2026-09-29',
      clientToken: 'tok-0001',
      shared: { payer: 'Balaji', mySharePaise: 300_000, paidByMePaise: 150_000 },
    }
    const res = await postExpense(body)
    const [, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).shared).toEqual(body.shared)
    expect(res.debt?.person).toBe('Rahul')
  })

  it('postExpense works without a shared block (existing contract unchanged)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ transaction: txn, replayed: false, debt: null, walletBalancePaise: 0 }))
    await postExpense({
      item: 'Bus ticket',
      amountPaise: 3_000,
      categoryKey: 'transport',
      necessity: 'necessary',
      walletKey: 'cash',
      date: '2026-09-29',
    })
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const sent = JSON.parse(init.body)
    expect('shared' in sent).toBe(false)
  })
})

describe('debt hooks (wiring)', () => {
  it('useDebts fetches and exposes the page', async () => {
    fetchMock.mockResolvedValue(okResponse({ debts: [debt], summary }))
    const { result } = renderHook(() => useDebts(), { wrapper: ({ children }) => wrapper(children) as never })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.debts).toHaveLength(1)
    expect(result.current.data?.summary?.totalOutstandingPaise).toBe(50_000)
  })

  it('useDebtsSummary exposes totals', async () => {
    fetchMock.mockResolvedValue(okResponse(summary))
    const { result } = renderHook(() => useDebtsSummary(), { wrapper: ({ children }) => wrapper(children) as never })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.people[0]?.person).toBe('Rahul')
  })

  it('useDebtPeople exposes autocomplete options', async () => {
    fetchMock.mockResolvedValue(okResponse({ people: [{ person: 'Balaji', outstandingPaise: 150_000 }] }))
    const { result } = renderHook(() => useDebtPeople(), { wrapper: ({ children }) => wrapper(children) as never })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.people[0]?.person).toBe('Balaji')
  })

  it('useAddExpense invalidates finance queries on success (existing behavior)', async () => {
    fetchMock.mockResolvedValue(okResponse({ transaction: txn, replayed: false, debt: null, walletBalancePaise: 0 }))
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useAddExpense(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    })
    await result.current.mutateAsync({
      item: 'X',
      amountPaise: 100,
      categoryKey: 'other',
      necessity: 'necessary',
      walletKey: 'cash',
      date: '2026-09-29',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['finance'] })
  })
})
