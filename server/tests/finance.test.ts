import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../src/app'
import type { Express } from 'express'

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
const MONTH = '2026-08'
const token = 'tok-aaaaaaaaaa'

async function registerAgent(email: string): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/register').send({ email, password: 'password123', name: 'T' })
  expect(res.status).toBe(201)
  return agent
}

/** Give a fresh agent its opening balances (zero-value wallets are skipped —
 * they need no ledger entry; a missing opening balance is the onboarding state). */
async function setupWallets(agent: ReturnType<typeof request.agent>, cashPaise: number, phonepePaise: number) {
  if (cashPaise > 0) {
    const cash = await agent.put('/api/finance/opening-balance').send({ walletKey: 'cash', amountPaise: cashPaise, date: '2026-08-01' })
    expect(cash.status).toBe(200)
  }
  if (phonepePaise > 0) {
    const phonepe = await agent.put('/api/finance/opening-balance').send({ walletKey: 'phonepe', amountPaise: phonepePaise, date: '2026-08-01' })
    expect(phonepe.status).toBe(200)
  }
}

async function balances(agent: ReturnType<typeof request.agent>): Promise<{ cash: number; phonepe: number; total: number }> {
  const res = await agent.get('/api/finance/overview')
  expect(res.status).toBe(200)
  const out: Record<string, number> = {}
  for (const w of res.body.data.wallets as { key: string; balancePaise: number }[]) out[w.key] = w.balancePaise
  return { cash: out.cash ?? 0, phonepe: out.phonepe ?? 0, total: res.body.data.totalBalancePaise }
}

interface Res {
  status: number
  body: any
}

async function expense(agent: ReturnType<typeof request.agent>, body: Record<string, unknown>): Promise<Res> {
  return agent.post('/api/finance/expenses').send({ clientToken: token + Math.random(), ...body }) as unknown as Promise<Res>
}

// ---------------------------------------------------------------------------
// A. Opening balances / balances / money received / expenses
// ---------------------------------------------------------------------------

describe('ledger basics', () => {
  it('sets opening balances and derives balances (A, G)', async () => {
    const agent = await registerAgent('open@example.com')
    await setupWallets(agent, 350_000, 100_000)
    const b = await balances(agent)
    expect(b.cash).toBe(350_000)
    expect(b.phonepe).toBe(100_000)
    expect(b.total).toBe(450_000)
  })

  it('records money received multiple times without overwriting (B, I)', async () => {
    const agent = await registerAgent('receive@example.com')
    await setupWallets(agent, 0, 20_000)
    await agent.post('/api/finance/money-in').send({ amountPaise: 70_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-02' })
    await agent.post('/api/finance/money-in').send({ amountPaise: 50_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-03' })
    await agent.post('/api/finance/money-in').send({ amountPaise: 350_000, walletKey: 'cash', source: 'Dad', date: '2026-08-02' })
    const b = await balances(agent)
    expect(b.phonepe).toBe(20_000 + 70_000 + 50_000)
    expect(b.cash).toBe(350_000)
  })

  it('expenses decrease only the chosen wallet (E, F, G)', async () => {
    const agent = await registerAgent('expense@example.com')
    await setupWallets(agent, 350_000, 100_000)
    const bus = await expense(agent, { item: 'Bus ticket', amountPaise: 3_000, categoryKey: 'transport', necessity: 'necessary', walletKey: 'cash', date: DATE })
    expect(bus.status).toBe(201)
    const food = await expense(agent, { item: 'Lunch', amountPaise: 15_000, categoryKey: 'outside_food', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    expect(food.status).toBe(201)
    const b = await balances(agent)
    expect(b.cash).toBe(347_000)
    expect(b.phonepe).toBe(85_000)
    expect(b.total).toBe(432_000)
    expect(food.body.data.walletBalancePaise).toBe(85_000)
  })

  it('rejects overdrafts with the current balance (server authoritative)', async () => {
    const agent = await registerAgent('overdraft@example.com')
    const res = await expense(agent, { item: 'Too much', amountPaise: 5_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE')
    expect(res.body.error.details.balancePaise).toBe(0)
  })

  it('rejects future-dated transactions', async () => {
    const agent = await registerAgent('future@example.com')
    const res = await expense(agent, { item: 'Future', amountPaise: 100, categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: '2099-01-01' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FUTURE_DATE')
  })
})

// ---------------------------------------------------------------------------
// Idempotency (N — replay returns the original)
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('replays the original transaction for a repeated clientToken', async () => {
    const agent = await registerAgent('idem@example.com')
    await setupWallets(agent, 100_000, 0)
    const body = { item: 'Tea', amountPaise: 1_500, categoryKey: 'drinks', necessity: 'optional', walletKey: 'cash', date: DATE, clientToken: 'retry-token-000001' }
    const first = await agent.post('/api/finance/expenses').send(body)
    expect(first.status).toBe(201)
    expect(first.body.data.replayed).toBe(false)
    const second = await agent.post('/api/finance/expenses').send(body)
    expect(second.status).toBe(200)
    expect(second.body.data.replayed).toBe(true)
    expect(String(second.body.data.transaction._id)).toBe(String(first.body.data.transaction._id))
    const b = await balances(agent)
    expect(b.cash).toBe(98_500)
  })

  it('different clientTokens create separate transactions', async () => {
    const agent = await registerAgent('idem2@example.com')
    await setupWallets(agent, 100_000, 0)
    const base = { item: 'Tea', amountPaise: 1_500, categoryKey: 'drinks', necessity: 'optional', walletKey: 'cash', date: DATE }
    await agent.post('/api/finance/expenses').send({ ...base, clientToken: 'token-aaaaaaaaaa' })
    await agent.post('/api/finance/expenses').send({ ...base, clientToken: 'token-bbbbbbbbbb' })
    const b = await balances(agent)
    expect(b.cash).toBe(97_000)
  })
})

// ---------------------------------------------------------------------------
// Edit / delete safety (J, and the no-negative invariant)
// ---------------------------------------------------------------------------

describe('edit and delete', () => {
  it('edits an expense amount and wallet correctly (₹300 → ₹500 case)', async () => {
    const agent = await registerAgent('edit@example.com')
    await setupWallets(agent, 0, 62_000)
    const created = await expense(agent, { item: 'Expense', amountPaise: 30_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    const id = created.body.data.transaction._id
    const edited = await agent.put(`/api/finance/transactions/${id}`).send({ amountPaise: 50_000 })
    expect(edited.status).toBe(200)
    const b = await balances(agent)
    expect(b.phonepe).toBe(12_000)
  })

  it('rejects an edit that would make a wallet negative', async () => {
    const agent = await registerAgent('edit2@example.com')
    await setupWallets(agent, 0, 62_000)
    const created = await expense(agent, { item: 'Expense', amountPaise: 30_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    const id = created.body.data.transaction._id
    const res = await agent.put(`/api/finance/transactions/${id}`).send({ amountPaise: 90_000 })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NEGATIVE_BALANCE')
  })

  it('moves money between wallets when the wallet changes (J)', async () => {
    const agent = await registerAgent('edit3@example.com')
    await setupWallets(agent, 100_000, 100_000)
    const created = await expense(agent, { item: 'Move', amountPaise: 10_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: DATE })
    const id = created.body.data.transaction._id
    await agent.put(`/api/finance/transactions/${id}`).send({ walletKey: 'phonepe' })
    const b = await balances(agent)
    expect(b.cash).toBe(100_000)
    expect(b.phonepe).toBe(90_000)
  })

  it('deletes an expense and balances recover', async () => {
    const agent = await registerAgent('del@example.com')
    await setupWallets(agent, 0, 62_000)
    const created = await expense(agent, { item: 'Gone', amountPaise: 30_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    const id = created.body.data.transaction._id
    const del = await agent.delete(`/api/finance/transactions/${id}`)
    expect(del.status).toBe(204)
    expect((await balances(agent)).phonepe).toBe(62_000)
  })

  it('deletes money received but rejects when a wallet would go negative (12)', async () => {
    const agent = await registerAgent('del2@example.com')
    await setupWallets(agent, 0, 0)
    const moneyIn = await agent.post('/api/finance/money-in').send({ amountPaise: 50_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-01' })
    const id = moneyIn.body.data.transaction._id
    await expense(agent, { item: 'Spend', amountPaise: 50_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    // Deleting the inflow would leave the wallet at -50_000 → rejected.
    const res = await agent.delete(`/api/finance/transactions/${id}`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NEGATIVE_BALANCE')
  })

  it('protects the opening balance from generic edit/delete', async () => {
    const agent = await registerAgent('protect@example.com')
    await setupWallets(agent, 100_000, 0)
    const list = await agent.get('/api/finance/transactions?type=opening_balance')
    const id = list.body.data.transactions[0]._id
    const edit = await agent.put(`/api/finance/transactions/${id}`).send({ amountPaise: 1 })
    expect(edit.status).toBe(409)
    expect(edit.body.error.code).toBe('OPENING_BALANCE_PROTECTED')
    const del = await agent.delete(`/api/finance/transactions/${id}`)
    expect(del.status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
// Opening balance correction (§7) and reconciliation adjustments (S)
// ---------------------------------------------------------------------------

describe('opening balance correction and adjustments', () => {
  it('corrects an opening balance only with explicit confirmation, with audit history', async () => {
    const agent = await registerAgent('correct@example.com')
    await setupWallets(agent, 350_000, 0)

    // Without acknowledgment → rejected.
    const noAck = await agent.put('/api/finance/opening-balance').send({ walletKey: 'cash', amountPaise: 300_000, previousAmountPaise: 350_000 })
    expect(noAck.status).toBe(400)
    expect(noAck.body.error.code).toBe('CONFIRMATION_REQUIRED')

    // With wrong previous value → rejected (client must have shown the impact).
    const stale = await agent.put('/api/finance/opening-balance').send({ walletKey: 'cash', amountPaise: 300_000, acknowledged: true, previousAmountPaise: 999 })
    expect(stale.status).toBe(400)

    // Proper correction: impact shown, confirmed, audited.
    const ok = await agent.put('/api/finance/opening-balance').send({ walletKey: 'cash', amountPaise: 300_000, acknowledged: true, previousAmountPaise: 350_000 })
    expect(ok.status).toBe(200)
    expect(ok.body.data.balanceImpactPaise).toBe(-50_000)
    expect(ok.body.data.walletBalancePaise).toBe(300_000)
    expect(ok.body.data.previousAmountPaise).toBe(350_000)
    // The audit trail preserves the original value on the corrected document.
    const history = ok.body.data.transaction.history
    expect(history).toHaveLength(1)
    expect(history[0].amountPaise).toBe(350_000)
  })

  it('reconciles a wallet with a required-reason adjustment (S)', async () => {
    const agent = await registerAgent('recon@example.com')
    await setupWallets(agent, 285_000, 0)

    const noReason = await agent.post('/api/finance/adjustment').send({ walletKey: 'cash', deltaPaise: -2_000, reason: 'no' })
    expect(noReason.status).toBe(400)

    const adj = await agent.post('/api/finance/adjustment').send({ walletKey: 'cash', deltaPaise: -2_000, reason: 'Cash counted manually', date: DATE })
    expect(adj.status).toBe(201)
    expect(adj.body.data.balanceBeforePaise).toBe(285_000)
    expect(adj.body.data.balanceAfterPaise).toBe(283_000)

    // The adjustment is a permanent ledger event, listed in history.
    const list = await agent.get('/api/finance/transactions?type=balance_adjustment')
    expect(list.body.data.transactions).toHaveLength(1)
    expect(list.body.data.transactions[0].reason).toBe('Cash counted manually')
  })

  it('rejects an adjustment that would negative a wallet', async () => {
    const agent = await registerAgent('recon2@example.com')
    await setupWallets(agent, 1_000, 0)
    const res = await agent.post('/api/finance/adjustment').send({ walletKey: 'cash', deltaPaise: -5_000, reason: 'Bad count' })
    expect(res.status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
// Dad report (C, D, T)
// ---------------------------------------------------------------------------

describe('dad report', () => {
  it('totals, counts and averages transfers; splits wallets; filters periods', async () => {
    const agent = await registerAgent('dad@example.com')
    await setupWallets(agent, 0, 0)
    await agent.post('/api/finance/money-in').send({ amountPaise: 350_000, walletKey: 'cash', source: 'Dad', date: '2026-08-02' })
    await agent.post('/api/finance/money-in').send({ amountPaise: 70_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-08' })
    await agent.post('/api/finance/money-in').send({ amountPaise: 50_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-19' })

    const all = await agent.get('/api/finance/reports/dad')
    expect(all.status).toBe(200)
    expect(all.body.data.totalPaise).toBe(470_000)
    expect(all.body.data.count).toBe(3)
    expect(all.body.data.averagePaise).toBe(Math.round(470_000 / 3))
    expect(all.body.data.byWallet.cashPaise).toBe(350_000)
    expect(all.body.data.byWallet.phonepePaise).toBe(120_000)
    expect(all.body.data.transactions).toHaveLength(3)
    expect(all.body.data.transactions[0].date).toBe('2026-08-02')

    // Month filter — everything is August here; check a narrow range.
    const range = await agent.get('/api/finance/reports/dad?from=2026-08-05&to=2026-08-31')
    expect(range.body.data.totalPaise).toBe(120_000)
    expect(range.body.data.count).toBe(2)

    // Opening balances and adjustments never appear as money received.
    const agent2 = await registerAgent('dad2@example.com')
    await setupWallets(agent2, 500_000, 0)
    await agent2.post('/api/finance/adjustment').send({ walletKey: 'cash', deltaPaise: -1_000, reason: 'count', date: DATE })
    const report2 = await agent2.get('/api/finance/reports/dad')
    expect(report2.body.data.totalPaise).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Analytics — hand-calculated ledger totals (L, M, N, O, 15)
// ---------------------------------------------------------------------------

describe('analytics', () => {
  async function richUser(email: string) {
    const agent = await registerAgent(email)
    await setupWallets(agent, 350_000, 100_000)
    await agent.post('/api/finance/money-in').send({ amountPaise: 70_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-05' })
    await expense(agent, { item: 'Bus ticket', amountPaise: 3_000, categoryKey: 'transport', necessity: 'necessary', walletKey: 'cash', date: DATE })
    await expense(agent, { item: 'Lunch', amountPaise: 15_000, categoryKey: 'outside_food', necessity: 'necessary', walletKey: 'phonepe', date: DATE })
    await expense(agent, { item: 'Chips', amountPaise: 6_500, categoryKey: 'fast_food', necessity: 'wasteful', walletKey: 'phonepe', date: DATE })
    return agent
  }

  it('matches hand-calculated totals for the month (O)', async () => {
    const agent = await richUser('analytics@example.com')
    const res = await agent.get(`/api/finance/analytics?from=${MONTH}-01&to=${MONTH}-31`)
    const d = res.body.data
    expect(d.totals.receivedPaise).toBe(70_000)
    expect(d.totals.spentPaise).toBe(24_500)
    expect(d.totals.adjustmentsPaise).toBe(0)
    expect(d.counts.expenses).toBe(3)
    expect(d.counts.receivedTransactions).toBe(1)
    // Category split
    const byCat = Object.fromEntries(d.byCategory.map((c: { key: string; spentPaise: number }) => [c.key, c.spentPaise]))
    expect(byCat['transport']).toBe(3_000)
    expect(byCat['outside_food']).toBe(15_000)
    expect(byCat['fast_food']).toBe(6_500)
    // Necessity split (L)
    expect(d.byNecessity.necessaryPaise).toBe(18_000)
    expect(d.byNecessity.wastefulPaise).toBe(6_500)
    // Food (M): outside_food + fast_food
    expect(d.food.totalPaise).toBe(21_500)
    expect(d.food.wastefulPaise).toBe(6_500)
    // Daily series
    expect(d.dailySeries).toEqual([{ date: DATE, spentPaise: 24_500 }])
    // Largest expense
    expect(d.largestExpense.amountPaise).toBe(15_000)
    // Money flow: opening (brought forward + in-range opening txns) → ending
    expect(d.moneyFlow.openingPaise).toBe(450_000)
    expect(d.moneyFlow.receivedPaise).toBe(70_000)
    expect(d.moneyFlow.availablePaise).toBe(520_000)
    expect(d.moneyFlow.expensesPaise).toBe(24_500)
    expect(d.moneyFlow.endingPaise).toBe(495_500)
  })

  it('money flow accounts for adjustments; balances equal ledger ending (15, 16)', async () => {
    const agent = await richUser('flow@example.com')
    await agent.post('/api/finance/adjustment').send({ walletKey: 'cash', deltaPaise: -2_000, reason: 'count', date: DATE })
    const res = await agent.get(`/api/finance/analytics?from=${MONTH}-01&to=${MONTH}-31`)
    expect(res.body.data.moneyFlow.adjustmentsPaise).toBe(-2_000)
    expect(res.body.data.moneyFlow.endingPaise).toBe(493_500)
    const b = await balances(agent)
    expect(b.total).toBe(493_500)
  })

  it('wasteful percentage-based insights are suppressed without data (8, 17)', async () => {
    const agent = await registerAgent('empty@example.com')
    const res = await agent.get('/api/finance/insights?from=2026-08-01&to=2026-08-31')
    expect(res.status).toBe(200)
    expect(res.body.data.messages).toEqual(['No money recorded for this period yet.'])
  })

  it('flags low balances from configured thresholds (Q)', async () => {
    const agent = await richUser('lowbal@example.com')
    await agent.put('/api/finance/settings').send({ alertThresholdPaise: { cash: 400_000, phonepe: 10_000 } })
    const res = await agent.get('/api/finance/insights?from=2026-08-01&to=2026-08-31')
    const low = res.body.data.flags.lowBalance
    expect(low).toHaveLength(1)
    expect(low[0].walletKey).toBe('cash')
    // Overview carries the flag too.
    const overview = await agent.get('/api/finance/overview')
    const cash = overview.body.data.wallets.find((w: { key: string }) => w.key === 'cash')
    expect(cash.low).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Month boundaries (H, I, 9) — no resets, carry-over works
// ---------------------------------------------------------------------------

describe('month boundaries', () => {
  it('carries balances across months and never resets (H, I)', async () => {
    const agent = await registerAgent('carry@example.com')
    await setupWallets(agent, 50_000, 25_000)
    // "July ends": balances as-is. "August": Dad sends ₹700 PhonePe.
    await agent.post('/api/finance/money-in').send({ amountPaise: 70_000, walletKey: 'phonepe', source: 'Dad', date: '2026-08-02' })
    const b = await balances(agent)
    expect(b.cash).toBe(50_000)
    expect(b.phonepe).toBe(95_000)

    // August-only analytics see only the August receipt; July balances carry over.
    const aug = await agent.get('/api/finance/analytics?from=2026-08-01&to=2026-08-31')
    expect(aug.body.data.totals.receivedPaise).toBe(70_000)
    expect(aug.body.data.moneyFlow.openingPaise).toBe(75_000) // carried over
    expect(aug.body.data.moneyFlow.endingPaise).toBe(145_000)
  })
})

// ---------------------------------------------------------------------------
// Canonical expense / merged scoring (K) and clear-day
// ---------------------------------------------------------------------------

describe('canonical expense and scoring integration', () => {
  it('a ledger expense reaches the day score exactly once (K)', async () => {
    const agent = await registerAgent('merge@example.com')
    await setupWallets(agent, 0, 100_000)
    // Day saved first, expense added after → score re-stamped.
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'junkFood', status: 'completed' }] })
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(45) // 60 - 15
    await expense(agent, { item: 'Chips', amountPaise: 5_000, categoryKey: 'fast_food', necessity: 'wasteful', walletKey: 'phonepe', date: DATE })
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(37) // 60 - 15 - 8
  })

  it('legacy purchase conversion keeps the score identical (11, 25-K)', async () => {
    const agent = await registerAgent('legacy@example.com')
    // Legacy-style day save with an embedded purchase (old client behaviour).
    await agent.put(`/api/days/${DATE}`).send({
      habits: [{ habitKey: 'junkFood', status: 'completed' }],
      purchases: [{ item: 'Chips', amount: 50, category: 'Food', necessary: false }],
    })
    const before = (await agent.get(`/api/days/${DATE}`)).body.data.score
    expect(before).toBe(37)

    // Convert it into the ledger with a wallet.
    const conv = await agent.post('/api/finance/legacy-purchases/convert').send({ date: DATE, index: 0, walletKey: 'phonepe', expectedItem: 'Chips' })
    expect(conv.status).toBe(200)
    expect(conv.body.data.alreadyConverted).toBe(false)

    // Score identical after conversion — counted exactly once, via the ledger.
    const after = (await agent.get(`/api/days/${DATE}`)).body.data.score
    expect(after).toBe(37)

    // The embedded purchase is stamped; the review list is now empty.
    const legacy = await agent.get('/api/finance/legacy-purchases')
    expect(legacy.body.data.purchases).toHaveLength(0)

    // Converting again is a no-op.
    const again = await agent.post('/api/finance/legacy-purchases/convert').send({ date: DATE, index: 0, walletKey: 'phonepe' })
    expect(again.body.data.alreadyConverted).toBe(true)
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(37)
  })

  it('editing and removing day expenses updates the score', async () => {
    const agent = await registerAgent('merge2@example.com')
    await setupWallets(agent, 0, 100_000)
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'junkFood', status: 'completed' }] })
    const created = await expense(agent, { item: 'Chips', amountPaise: 5_000, categoryKey: 'fast_food', necessity: 'wasteful', walletKey: 'phonepe', date: DATE })
    const id = created.body.data.transaction._id
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(37)
    // Necessary now → no penalty.
    await agent.put(`/api/finance/transactions/${id}`).send({ necessity: 'necessary' })
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(45)
    // Removed → back to habit-only score.
    await agent.delete(`/api/finance/transactions/${id}`)
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(45)
  })

  it('clearing a day removes the record and that date\'s ledger expenses', async () => {
    const agent = await registerAgent('clear@example.com')
    await setupWallets(agent, 0, 100_000)
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed' }] })
    await expense(agent, { item: 'Chips', amountPaise: 5_000, categoryKey: 'fast_food', necessity: 'wasteful', walletKey: 'phonepe', date: DATE })
    const del = await agent.delete(`/api/days/${DATE}`)
    expect(del.status).toBe(204)
    const day = await agent.get(`/api/days/${DATE}`)
    expect(day.body.data.score).toBeNull()
    const txns = await agent.get(`/api/finance/transactions?date=${DATE}`)
    expect(txns.body.data.transactions).toHaveLength(0)
    // Balances recover.
    expect((await balances(agent)).phonepe).toBe(100_000)
  })
})

// ---------------------------------------------------------------------------
// Isolation, verify, CSV, filters
// ---------------------------------------------------------------------------

describe('isolation, verify, export', () => {
  it('isolates finance data per user', async () => {
    const alice = await registerAgent('falice@example.com')
    await setupWallets(alice, 100_000, 0)
    await expense(alice, { item: 'Secret', amountPaise: 1_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: DATE })
    const bob = await registerAgent('fbob@example.com')
    const list = await bob.get('/api/finance/transactions')
    expect(list.body.data.transactions).toHaveLength(0)
    expect((await balances(bob)).total).toBe(0)
    const aliceTxns = await alice.get('/api/finance/transactions')
    const aliceId = aliceTxns.body.data.transactions[0]._id
    const steal = await bob.get(`/api/finance/transactions/${aliceId}`)
    expect(steal.status).toBe(404)
  })

  it('verifies ledger consistency', async () => {
    const agent = await registerAgent('verify@example.com')
    await setupWallets(agent, 100_000, 50_000)
    const res = await agent.get('/api/finance/verify')
    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)
    expect(res.body.data.issues).toEqual([])
  })

  it('filters transactions by date range and wallet', async () => {
    const agent = await registerAgent('filter@example.com')
    await setupWallets(agent, 100_000, 0)
    await expense(agent, { item: 'A', amountPaise: 1_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: '2026-08-01' })
    await expense(agent, { item: 'B', amountPaise: 1_000, categoryKey: 'other', necessity: 'necessary', walletKey: 'cash', date: '2026-08-20' })
    const onlyEarly = await agent.get('/api/finance/transactions?from=2026-08-01&to=2026-08-10&type=expense')
    expect(onlyEarly.body.data.transactions.map((t: { item: string }) => t.item)).toEqual(['A'])
    const onlyPhonepe = await agent.get('/api/finance/transactions?walletKey=phonepe&type=expense')
    expect(onlyPhonepe.body.data.transactions).toHaveLength(0)
  })

  it('exports CSV with the expected shape', async () => {
    const agent = await registerAgent('csv@example.com')
    await setupWallets(agent, 100_000, 0)
    await expense(agent, { item: 'Tea, with "milk"', amountPaise: 1_500, categoryKey: 'drinks', necessity: 'optional', walletKey: 'cash', date: DATE })
    const res = await agent.get(`/api/finance/export.csv?from=${MONTH}-01&to=${MONTH}-31`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    const text = res.text
    expect(text.charCodeAt(0)).toBe(0xfeff)
    const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
    expect(lines[0]).toBe('Date,Type,Item,Amount,Wallet,Category,Necessity,Source,Note')
    expect(lines).toHaveLength(3) // header + opening-balance row + expense row
    expect(lines.some((l) => l.includes('"Tea, with ""milk"""'))).toBe(true)
    // Expenses are signed negative in the ledger → −15.00 in the CSV.
    expect(lines.some((l) => l.includes(',-15.00,Cash,Drinks,optional'))).toBe(true)
  })

  it('JSON export includes finance transactions', async () => {
    const agent = await registerAgent('jsonexp@example.com')
    await setupWallets(agent, 1_000, 0)
    const res = await agent.get('/api/export')
    expect(res.body.data.financeTransactions).toHaveLength(1)
  })
})
