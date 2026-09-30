import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../src/app'
import type { Express } from 'express'

// Debt repayment (Phase 5) — test matrix per the phase plan:
//   full / partial / multiple partial repayments
//   exact final repayment → settled
//   rejections: amount > outstanding (409), zero/negative (400), already settled (409)
//   insufficient balance (409), wrong/nonexistent debt (404)
//   cash + phonepe wallets, idempotent replay (200, no double charge)
//   ledger is truth: repaid recomputed from repayment txns; wallet decreases
//   only by the repayment; friend's original payment is never income.
//   edit/delete of repayment txns → 409 REPAYMENT_PROTECTED.

let mongod: MongoMemoryServer
let app: Express

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  app = createApp()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

const DATE = '2026-08-10'
let tokenSeq = 0
const nextToken = () => `tok-repay-${String(++tokenSeq).padStart(6, '0')}`

async function registerAgent(email: string): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/register').send({ email, password: 'password123', name: 'T' })
  expect(res.status).toBe(201)
  return agent
}

async function setupWallets(agent: ReturnType<typeof request.agent>, cashPaise: number, phonepePaise = 0) {
  if (cashPaise > 0) {
    const r = await agent.put('/api/finance/opening-balance').send({ walletKey: 'cash', amountPaise: cashPaise, date: '2026-08-01' })
    expect(r.status).toBe(200)
  }
  if (phonepePaise > 0) {
    const r = await agent.put('/api/finance/opening-balance').send({ walletKey: 'phonepe', amountPaise: phonepePaise, date: '2026-08-01' })
    expect(r.status).toBe(200)
  }
}

async function balances(agent: ReturnType<typeof request.agent>): Promise<{ cash: number; phonepe: number }> {
  const res = await agent.get('/api/finance/overview')
  expect(res.status).toBe(200)
  const out: Record<string, number> = {}
  for (const w of res.body.data.wallets as { key: string; balancePaise: number }[]) out[w.key] = w.balancePaise
  return { cash: out.cash ?? 0, phonepe: out.phonepe ?? 0 }
}

async function createDebt(agent: ReturnType<typeof request.agent>, opts: { item: string; total: number; share: number; paid: number; payer: string; wallet: 'cash' | 'phonepe' }) {
  const res = await agent.post('/api/finance/expenses').send({
    item: opts.item,
    amountPaise: opts.total,
    categoryKey: 'other',
    necessity: 'necessary',
    walletKey: opts.wallet,
    date: DATE,
    clientToken: nextToken(),
    shared: { payer: opts.payer, mySharePaise: opts.share, paidByMePaise: opts.paid },
  })
  expect(res.status).toBe(201)
  return res.body.data.debt as { _id: string; person: string; originalPaise: number }
}

async function repay(agent: ReturnType<typeof request.agent>, debtId: string, body: Record<string, unknown>) {
  return agent.post(`/api/finance/debts/${debtId}/repay`).send({ clientToken: nextToken(), ...body })
}

async function debtById(agent: ReturnType<typeof request.agent>, debtId: string) {
  const res = await agent.get('/api/finance/debts?status=all')
  expect(res.status).toBe(200)
  const all = res.body.data.debts as { _id: string; repaidPaise: number; status: string; originalPaise: number }[]
  return all.find((d) => d._id === debtId)!
}

async function repaymentTxns(agent: ReturnType<typeof request.agent>) {
  const res = await agent.get('/api/finance/transactions?type=debt_repayment')
  expect(res.status).toBe(200)
  return res.body.data.transactions as { _id: string; amountPaise: number; walletKey: string; item: string; type: string }[]
}

// ---------------------------------------------------------------------------
// Happy paths.
// ---------------------------------------------------------------------------

describe('repayment: happy paths', () => {
  it('full repayment → settled, wallet decreases by exactly the amount', async () => {
    const agent = await registerAgent('repay-full@example.com')
    await setupWallets(agent, 100_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })

    const res = await repay(agent, debt._id, { amountPaise: 50_000, walletKey: 'cash' })
    expect(res.status).toBe(201)
    expect(res.body.data.settled).toBe(true)
    expect(res.body.data.debt.status).toBe('settled')
    expect(res.body.data.debt.repaidPaise).toBe(50_000)
    expect(res.body.data.walletBalancePaise).toBe(50_000)
    const b = await balances(agent)
    expect(b.cash).toBe(50_000)
    expect(b.phonepe).toBe(0)

    // Settled debts leave the outstanding list.
    const out = await agent.get('/api/finance/debts?status=outstanding')
    expect((out.body.data.debts as unknown[]).length).toBe(0)
    const summary = (await agent.get('/api/finance/debts/summary')).body.data
    expect(summary.totalOutstandingPaise).toBe(0)
  })

  it('partial repayment → outstanding shrinks, status stays outstanding', async () => {
    const agent = await registerAgent('repay-partial@example.com')
    await setupWallets(agent, 0, 25_000)
    const debt = await createDebt(agent, { item: 'Gym', total: 60_000, share: 30_000, paid: 15_000, payer: 'Balaji', wallet: 'phonepe' })

    const res = await repay(agent, debt._id, { amountPaise: 10_000, walletKey: 'phonepe' })
    expect(res.status).toBe(201)
    expect(res.body.data.settled).toBe(false)
    expect(res.body.data.debt.repaidPaise).toBe(10_000)
    expect(res.body.data.debt.status).toBe('outstanding')
    expect(res.body.data.walletBalancePaise).toBe(0) // 25_000 − 15_000 gym − 10_000 repay

    const d = await debtById(agent, debt._id)
    expect(d.repaidPaise).toBe(10_000)
    // Debt was share 30_000 − paid 15_000 = 15_000; 10_000 repaid → 5_000 left.
    const summary = (await agent.get('/api/finance/debts/summary')).body.data
    expect(summary.totalOutstandingPaise).toBe(5_000)
  })

  it('multiple partial repayments accumulate and the exact final one settles', async () => {
    const agent = await registerAgent('repay-multi@example.com')
    await setupWallets(agent, 150_000)
    const debt = await createDebt(agent, { item: 'Trip', total: 90_000, share: 90_000, paid: 0, payer: 'Arjun', wallet: 'cash' })

    const r1 = await repay(agent, debt._id, { amountPaise: 30_000, walletKey: 'cash' })
    expect(r1.body.data.debt.repaidPaise).toBe(30_000)
    expect(r1.body.data.debt.status).toBe('outstanding')
    const r2 = await repay(agent, debt._id, { amountPaise: 59_999, walletKey: 'cash' })
    expect(r2.body.data.debt.repaidPaise).toBe(89_999)
    expect(r2.body.data.debt.status).toBe('outstanding')
    const r3 = await repay(agent, debt._id, { amountPaise: 1, walletKey: 'cash' })
    expect(r3.body.data.debt.repaidPaise).toBe(90_000)
    expect(r3.body.data.debt.status).toBe('settled')
    expect(r3.body.data.settled).toBe(true)

    const b = await balances(agent)
    expect(b.cash).toBe(60_000) // 150_000 − 90_000 repaid
    const txns = await repaymentTxns(agent)
    expect(txns).toHaveLength(3)
  })

  it('works from the PhonePe wallet too', async () => {
    const agent = await registerAgent('repay-pe@example.com')
    await setupWallets(agent, 0, 80_000)
    const debt = await createDebt(agent, { item: 'Tickets', total: 40_000, share: 40_000, paid: 0, payer: 'Vikram', wallet: 'cash' })

    const res = await repay(agent, debt._id, { amountPaise: 25_000, walletKey: 'phonepe' })
    expect(res.status).toBe(201)
    expect(res.body.data.walletBalancePaise).toBe(55_000)
    const b = await balances(agent)
    expect(b.phonepe).toBe(55_000)
    expect(b.cash).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Rejections — nothing moves when the request is invalid.
// ---------------------------------------------------------------------------

describe('repayment: rejections', () => {
  it('amount > outstanding → 409 EXCEEDS_OUTSTANDING, wallet unchanged', async () => {
    const agent = await registerAgent('repay-over@example.com')
    await setupWallets(agent, 100_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })

    const res = await repay(agent, debt._id, { amountPaise: 50_001, walletKey: 'cash' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EXCEEDS_OUTSTANDING')
    expect((await balances(agent)).cash).toBe(100_000)
    expect((await debtById(agent, debt._id)).repaidPaise).toBe(0)
  })

  it('zero and negative amounts → 400', async () => {
    const agent = await registerAgent('repay-zero@example.com')
    await setupWallets(agent, 100_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })

    const zero = await repay(agent, debt._id, { amountPaise: 0, walletKey: 'cash' })
    expect(zero.status).toBe(400)
    const neg = await repay(agent, debt._id, { amountPaise: -5_000, walletKey: 'cash' })
    expect(neg.status).toBe(400)
  })

  it('insufficient wallet balance → 409 INSUFFICIENT_BALANCE', async () => {
    const agent = await registerAgent('repay-broke@example.com')
    await setupWallets(agent, 20_000)
    const debt = await createDebt(agent, { item: 'Laptop', total: 80_000, share: 80_000, paid: 0, payer: 'Rahul', wallet: 'cash' })

    const res = await repay(agent, debt._id, { amountPaise: 50_000, walletKey: 'cash' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE')
    expect((await debtById(agent, debt._id)).repaidPaise).toBe(0)
  })

  it('nonexistent and another user\'s debt → 404', async () => {
    const agent = await registerAgent('repay-missing@example.com')
    await setupWallets(agent, 100_000)
    const other = await registerAgent('repay-other@example.com')
    await setupWallets(other, 100_000)
    const foreignDebt = await createDebt(other, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })

    const missing = await repay(agent, '6' + '7'.repeat(23), { amountPaise: 1_000, walletKey: 'cash' })
    expect(missing.status).toBe(404)
    // Scoped to the authenticated user: someone else's debt is invisible.
    const foreign = await repay(agent, foreignDebt._id, { amountPaise: 1_000, walletKey: 'cash' })
    expect(foreign.status).toBe(404)
    expect((await balances(other)).cash).toBe(100_000)
  })

  it('already-settled debt → 409 DEBT_ALREADY_SETTLED', async () => {
    const agent = await registerAgent('repay-settled@example.com')
    await setupWallets(agent, 200_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })
    expect((await repay(agent, debt._id, { amountPaise: 50_000, walletKey: 'cash' })).status).toBe(201)

    const again = await repay(agent, debt._id, { amountPaise: 1_000, walletKey: 'cash' })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('DEBT_ALREADY_SETTLED')
    expect((await balances(agent)).cash).toBe(150_000) // only one repayment applied
  })

  it('invalid walletKey → 400', async () => {
    const agent = await registerAgent('repay-wallet@example.com')
    await setupWallets(agent, 100_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })
    const res = await repay(agent, debt._id, { amountPaise: 1_000, walletKey: 'upi' })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Idempotency + ledger-as-truth.
// ---------------------------------------------------------------------------

describe('repayment: idempotency and ledger invariants', () => {
  it('same clientToken replays once — wallet charged exactly one repayment', async () => {
    const agent = await registerAgent('repay-idem@example.com')
    await setupWallets(agent, 100_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })
    const token = 'tok-repay-replay-0001'
    const first = await agent.post(`/api/finance/debts/${debt._id}/repay`).send({ amountPaise: 20_000, walletKey: 'cash', clientToken: token })
    expect(first.status).toBe(201)
    expect(first.body.data.replayed).toBe(false)
    const second = await agent.post(`/api/finance/debts/${debt._id}/repay`).send({ amountPaise: 20_000, walletKey: 'cash', clientToken: token })
    expect(second.status).toBe(200)
    expect(second.body.data.replayed).toBe(true)

    const b = await balances(agent)
    expect(b.cash).toBe(80_000) // charged once
    expect((await debtById(agent, debt._id)).repaidPaise).toBe(20_000)
    expect((await repaymentTxns(agent))).toHaveLength(1)
  })

  it('wallet decreases ONLY by the repayment; the friend\'s original payment is never income', async () => {
    const agent = await registerAgent('repay-income@example.com')
    await setupWallets(agent, 100_000, 40_000)
    // Friend paid the full ₹500 — user's wallet must be untouched by the debt.
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'phonepe' })
    expect((await balances(agent)).cash).toBe(100_000) // no income recorded

    // Repay the whole PhonePe wallet — cash must stay untouched.
    const repaid = await repay(agent, debt._id, { amountPaise: 40_000, walletKey: 'phonepe' })
    expect(repaid.status).toBe(201)
    const b = await balances(agent)
    expect(b.phonepe).toBe(0) // exactly the repayment left the wallet
    expect(b.cash).toBe(100_000) // other wallet untouched
    // No money_received anywhere in the ledger.
    const income = await agent.get('/api/finance/transactions?type=money_received')
    expect((income.body.data.transactions as unknown[]).length).toBe(0)
  })

  it('repayment transactions are distinguishable and correctly labelled', async () => {
    const agent = await registerAgent('repay-labels@example.com')
    await setupWallets(agent, 100_000, 50_000)
    const debt = await createDebt(agent, { item: 'Gym', total: 60_000, share: 30_000, paid: 15_000, payer: 'Balaji', wallet: 'cash' })
    await repay(agent, debt._id, { amountPaise: 15_000, walletKey: 'phonepe' })

    const txns = await repaymentTxns(agent)
    expect(txns).toHaveLength(1)
    expect(txns[0]!.type).toBe('debt_repayment')
    expect(txns[0]!.amountPaise).toBe(-15_000) // signed outflow
    expect(txns[0]!.item).toContain('Balaji')

    // CSV labels repayments distinctly from shared-expense annotations.
    const csv = await agent.get('/api/finance/export.csv')
    expect(csv.text).toContain('debt_repayment')
    expect(csv.text).toContain('Debt repayment to Balaji')
    expect(csv.text).toContain('Shared: Balaji paid part')
  })

  it('repayment transactions cannot be edited or deleted (409 REPAYMENT_PROTECTED)', async () => {
    const agent = await registerAgent('repay-protect@example.com')
    await setupWallets(agent, 100_000)
    const debt = await createDebt(agent, { item: 'Dinner', total: 50_000, share: 50_000, paid: 0, payer: 'Rahul', wallet: 'cash' })
    const repaid = await repay(agent, debt._id, { amountPaise: 10_000, walletKey: 'cash' })
    expect(repaid.status).toBe(201)
    const txns = await repaymentTxns(agent)
    const id = txns[0]!._id

    const edit = await agent.put(`/api/finance/transactions/${id}`).send({ note: 'hacked' })
    expect(edit.status).toBe(409)
    expect(edit.body.error.code).toBe('REPAYMENT_PROTECTED')
    const del = await agent.delete(`/api/finance/transactions/${id}`)
    expect(del.status).toBe(409)
    expect(del.body.error.code).toBe('REPAYMENT_PROTECTED')

    // The debt is intact.
    expect((await debtById(agent, debt._id)).repaidPaise).toBe(10_000)
  })

  it('summary rollup stays consistent across partial repayment (case-insensitive person)', async () => {
    const agent = await registerAgent('repay-rollup@example.com')
    await setupWallets(agent, 200_000)
    const d1 = await createDebt(agent, { item: 'A', total: 40_000, share: 40_000, paid: 0, payer: 'rahul', wallet: 'cash' })
    const d2 = await createDebt(agent, { item: 'B', total: 30_000, share: 30_000, paid: 0, payer: 'Rahul', wallet: 'cash' })

    let summary = (await agent.get('/api/finance/debts/summary')).body.data
    expect(summary.people).toHaveLength(1) // grouped case-insensitively
    expect(summary.totalOutstandingPaise).toBe(70_000)

    await repay(agent, d1._id, { amountPaise: 40_000, walletKey: 'cash' })
    summary = (await agent.get('/api/finance/debts/summary')).body.data
    expect(summary.totalOutstandingPaise).toBe(30_000)
    expect(summary.people[0]!.debtCount).toBe(1)

    await repay(agent, d2._id, { amountPaise: 30_000, walletKey: 'cash' })
    summary = (await agent.get('/api/finance/debts/summary')).body.data
    expect(summary.totalOutstandingPaise).toBe(0)
    expect(summary.people).toHaveLength(0)
  })
})
