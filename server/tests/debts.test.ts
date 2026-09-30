import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../src/app'
import type { Express } from 'express'

// Debt / shared-expense feature (plan §11 test matrix):
//   normal expense  → unchanged behavior, no debt
//   someone else    → wallet untouched, debt = full share
//   split           → wallet reduced by paid-by-me only, debt = remainder
//   no debt         → share fully paid by me ⇒ no debt doc
//   validation      → share>total, paid>share, negatives, empty payer
//   idempotency     → same clientToken replays once (txn + debt)
//   protection      → shared expenses cannot be edited(amount/wallet)/deleted

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
const nextToken = () => `tok-debt-${String(++tokenSeq).padStart(6, '0')}`

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

async function addExpense(agent: ReturnType<typeof request.agent>, body: Record<string, unknown>) {
  return agent.post('/api/finance/expenses').send({ clientToken: nextToken(), ...body })
}

async function debtsOf(agent: ReturnType<typeof request.agent>, status = 'outstanding') {
  const res = await agent.get(`/api/finance/debts?status=${status}`)
  expect(res.status).toBe(200)
  return res.body.data as {
    debts: { _id: string; person: string; item: string; originalPaise: number; repaidPaise: number; status: string; date: string; transactionId: string }[]
    summary: { totalOutstandingPaise: number; outstandingCount: number; people: { person: string; outstandingPaise: number; debtCount: number }[] } | null
  }
}

// ---------------------------------------------------------------------------
// Normal expenses — existing behavior unchanged.
// ---------------------------------------------------------------------------

describe('shared expenses: normal path', () => {
  it('a normal expense creates no debt and behaves exactly as before', async () => {
    const agent = await registerAgent('normal@example.com')
    await setupWallets(agent, 100_000)
    const res = await addExpense(agent, { item: 'Bus ticket', amountPaise: 15_000, categoryKey: 'transport', necessity: 'necessary', walletKey: 'cash', date: DATE })
    expect(res.status).toBe(201)
    expect(res.body.data.debt).toBeNull()
    const b = await balances(agent)
    expect(b.cash).toBe(85_000)
    const d = await debtsOf(agent)
    expect(d.debts).toHaveLength(0)
    expect(d.summary).not.toBeNull()
    expect(d.summary!.totalOutstandingPaise).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Someone else paid — full share becomes debt, wallet untouched.
// ---------------------------------------------------------------------------

describe('shared expenses: someone else paid', () => {
  it('₹500 dinner paid by Rahul → wallet unchanged, debt ₹500', async () => {
    const agent = await registerAgent('rahul@example.com')
    await setupWallets(agent, 100_000)
    const res = await addExpense(agent, {
      item: 'Dinner', amountPaise: 50_000, categoryKey: 'outside_food', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Rahul', mySharePaise: 50_000 },
    })
    expect(res.status).toBe(201)
    const data = res.body.data
    expect(data.debt).not.toBeNull()
    expect(data.debt.person).toBe('Rahul')
    expect(data.debt.originalPaise).toBe(50_000)
    expect(data.debt.repaidPaise).toBe(0)
    expect(data.debt.status).toBe('outstanding')
    // Wallet must be untouched — a friend paying is NOT income and NOT outflow.
    expect(data.walletBalancePaise).toBe(100_000)
    const b = await balances(agent)
    expect(b.cash).toBe(100_000)
    // The expense txn records only the out-of-pocket amount (0 here).
    expect(data.transaction.amountPaise).toBe(0)
  })

  it('replayed clientToken does not create a second debt', async () => {
    const agent = await registerAgent('replay@example.com')
    await setupWallets(agent, 100_000)
    const body = {
      item: 'Movie', amountPaise: 25_000, categoryKey: 'entertainment', necessity: 'optional', walletKey: 'cash', date: DATE,
      shared: { payer: 'Rahul', mySharePaise: 25_000 },
    }
    const first = await agent.post('/api/finance/expenses').send({ clientToken: 'tok-replay-000001', ...body })
    expect(first.status).toBe(201)
    const second = await agent.post('/api/finance/expenses').send({ clientToken: 'tok-replay-000001', ...body })
    expect(second.status).toBe(200)
    expect(second.body.data.replayed).toBe(true)
    const d = await debtsOf(agent)
    expect(d.debts).toHaveLength(1)
    expect(d.summary!.totalOutstandingPaise).toBe(25_000)
  })
})

// ---------------------------------------------------------------------------
// Split — wallet reduced by paid-by-me only; debt = remainder.
// ---------------------------------------------------------------------------

describe('shared expenses: split', () => {
  it('₹6,000 gym, share ₹3,000, I paid ₹1,500, Balaji ₹1,500 → wallet −₹1,500, debt ₹1,500', async () => {
    const agent = await registerAgent('balaji@example.com')
    await setupWallets(agent, 500_000)
    const res = await addExpense(agent, {
      item: 'Gym membership', amountPaise: 600_000, categoryKey: 'health', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Balaji', mySharePaise: 300_000, paidByMePaise: 150_000 },
    })
    expect(res.status).toBe(201)
    const data = res.body.data
    expect(data.debt.person).toBe('Balaji')
    expect(data.debt.originalPaise).toBe(150_000)
    // Wallet decreased ONLY by what I paid.
    expect(data.walletBalancePaise).toBe(350_000)
    const b = await balances(agent)
    expect(b.cash).toBe(350_000)
    // Expense txn = the actual outflow only.
    expect(data.transaction.amountPaise).toBe(-150_000)
  })

  it('insufficient wallet checks the out-of-pocket amount, not the total', async () => {
    const agent = await registerAgent('split-overdraft@example.com')
    await setupWallets(agent, 10_000)
    // My share 300_000, I pay 20_000 > wallet 10_000 → rejected even though the
    // full expense (600_000) is far larger than the wallet.
    const res = await addExpense(agent, {
      item: 'Gym', amountPaise: 600_000, categoryKey: 'health', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Balaji', mySharePaise: 300_000, paidByMePaise: 20_000 },
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE')
    // Nothing persisted.
    const d = await debtsOf(agent)
    expect(d.debts).toHaveLength(0)
    const b = await balances(agent)
    expect(b.cash).toBe(10_000)
  })
})

// ---------------------------------------------------------------------------
// No debt — fully paid by me.
// ---------------------------------------------------------------------------

describe('shared expenses: no debt', () => {
  it('share fully paid by me → plain expense, no debt document', async () => {
    const agent = await registerAgent('nodebt@example.com')
    await setupWallets(agent, 500_000)
    const res = await addExpense(agent, {
      item: 'Groceries', amountPaise: 300_000, categoryKey: 'groceries', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: '', mySharePaise: 300_000, paidByMePaise: 300_000 },
    })
    expect(res.status).toBe(201)
    expect(res.body.data.debt).toBeNull()
    const b = await balances(agent)
    expect(b.cash).toBe(200_000)
    const d = await debtsOf(agent)
    expect(d.debts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

describe('shared expenses: validation', () => {
  const base = { item: 'X', categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: DATE }

  it('rejects my share > total', async () => {
    const agent = await registerAgent('v1@example.com')
    await setupWallets(agent, 500_000)
    const res = await addExpense(agent, { ...base, amountPaise: 100_000, shared: { payer: 'Rahul', mySharePaise: 150_000 } })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects paid-by-me > my share', async () => {
    const agent = await registerAgent('v2@example.com')
    await setupWallets(agent, 500_000)
    const res = await addExpense(agent, { ...base, amountPaise: 100_000, shared: { payer: 'Rahul', mySharePaise: 80_000, paidByMePaise: 90_000 } })
    expect(res.status).toBe(400)
  })

  it('rejects negative values', async () => {
    const agent = await registerAgent('v3@example.com')
    await setupWallets(agent, 500_000)
    const negShare = await addExpense(agent, { ...base, amountPaise: 100_000, shared: { payer: 'Rahul', mySharePaise: -5 } })
    expect(negShare.status).toBe(400)
    const negPaid = await addExpense(agent, { ...base, amountPaise: 100_000, shared: { payer: 'Rahul', mySharePaise: 50_000, paidByMePaise: -1 } })
    expect(negPaid.status).toBe(400)
  })

  it('rejects zero my-share with a payer (nothing is actually owed)', async () => {
    const agent = await registerAgent('v4@example.com')
    await setupWallets(agent, 500_000)
    const res = await addExpense(agent, { ...base, amountPaise: 100_000, shared: { payer: 'Rahul', mySharePaise: 0 } })
    expect(res.status).toBe(400)
  })

  it('rejects a debt with an empty payer', async () => {
    const agent = await registerAgent('v5@example.com')
    await setupWallets(agent, 500_000)
    const res = await addExpense(agent, { ...base, amountPaise: 100_000, shared: { payer: '   ', mySharePaise: 50_000 } })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Debts read endpoints + person rollups.
// ---------------------------------------------------------------------------

describe('debts listing and rollups', () => {
  it('summarises per person and totals outstanding (case-insensitive grouping)', async () => {
    const agent = await registerAgent('summary@example.com')
    // Wallet must cover all three out-of-pocket parts: ₹500 + ₹200 + ₹1,500.
    await setupWallets(agent, 500_000)
    await addExpense(agent, {
      item: 'Dinner', amountPaise: 50_000, categoryKey: 'outside_food', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Rahul', mySharePaise: 50_000 },
    })
    await addExpense(agent, {
      item: 'Cab', amountPaise: 20_000, categoryKey: 'transport', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'rahul', mySharePaise: 20_000 },
    })
    await addExpense(agent, {
      item: 'Gym', amountPaise: 600_000, categoryKey: 'health', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Balaji', mySharePaise: 300_000, paidByMePaise: 150_000 },
    })
    const d = await debtsOf(agent)
    expect(d.debts).toHaveLength(3)
    expect(d.summary!.totalOutstandingPaise).toBe(50_000 + 20_000 + 150_000)
    expect(d.summary!.outstandingCount).toBe(3)
    const rahul = d.summary!.people.find((p) => p.person.toLowerCase() === 'rahul')
    expect(rahul!.outstandingPaise).toBe(70_000)
    expect(rahul!.debtCount).toBe(2)
  })

  it('exposes distinct people for autocomplete', async () => {
    const agent = await registerAgent('people@example.com')
    await setupWallets(agent, 10_000)
    await addExpense(agent, {
      item: 'Dinner', amountPaise: 50_000, categoryKey: 'outside_food', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Rahul', mySharePaise: 50_000 },
    })
    const res = await agent.get('/api/finance/debts/people')
    expect(res.status).toBe(200)
    expect(res.body.data.people).toEqual([{ person: 'Rahul', outstandingPaise: 50_000 }])
  })
})

// ---------------------------------------------------------------------------
// Phase-1 protection of debt-linked transactions.
// ---------------------------------------------------------------------------

describe('shared expense protection', () => {
  async function makeShared(agent: ReturnType<typeof request.agent>) {
    const res = await addExpense(agent, {
      item: 'Shared thing', amountPaise: 60_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Rahul', mySharePaise: 40_000, paidByMePaise: 20_000 },
    })
    expect(res.status).toBe(201)
    return res.body.data.transaction as { _id: string; debtId: string }
  }

  it('blocks amount edits on a debt-linked expense', async () => {
    const agent = await registerAgent('prot1@example.com')
    await setupWallets(agent, 100_000)
    const txn = await makeShared(agent)
    expect(txn.debtId).toBeTruthy()
    const res = await agent.put(`/api/finance/transactions/${txn._id}`).send({ amountPaise: 99_000 })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SHARED_EXPENSE_PROTECTED')
  })

  it('blocks wallet moves on a debt-linked expense', async () => {
    const agent = await registerAgent('prot2@example.com')
    await setupWallets(agent, 100_000)
    const txn = await makeShared(agent)
    const res = await agent.put(`/api/finance/transactions/${txn._id}`).send({ walletKey: 'phonepe' })
    expect(res.status).toBe(409)
  })

  it('allows non-amount edits (note) on a debt-linked expense', async () => {
    const agent = await registerAgent('prot3@example.com')
    await setupWallets(agent, 100_000)
    const txn = await makeShared(agent)
    const res = await agent.put(`/api/finance/transactions/${txn._id}`).send({ note: 'updated note' })
    expect(res.status).toBe(200)
  })

  it('blocks deleting a debt-linked expense and keeps the debt', async () => {
    const agent = await registerAgent('prot4@example.com')
    await setupWallets(agent, 100_000)
    const txn = await makeShared(agent)
    const res = await agent.delete(`/api/finance/transactions/${txn._id}`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SHARED_EXPENSE_PROTECTED')
    const d = await debtsOf(agent)
    expect(d.debts).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// CSV export annotates shared expenses (additive).
// ---------------------------------------------------------------------------

describe('csv export', () => {
  it('marks shared expenses in the Note column', async () => {
    const agent = await registerAgent('csv@example.com')
    await setupWallets(agent, 100_000)
    await addExpense(agent, {
      item: 'Dinner', amountPaise: 50_000, categoryKey: 'outside_food', necessity: 'necessary', walletKey: 'cash', date: DATE,
      shared: { payer: 'Rahul', mySharePaise: 50_000 },
    })
    const csv = await agent.get('/api/finance/export.csv')
    expect(csv.status).toBe(200)
    const text = csv.text as string
    expect(text).toContain('Shared: Rahul paid part')
  })
})
