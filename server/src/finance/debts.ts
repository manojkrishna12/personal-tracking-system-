// Debt service — creation (linked to the expense that caused it), listing and
// rollups. The ledger stays the source of truth for money; debts only record
// obligations. Creation runs inside withTransaction() at the route so the
// expense + debt pair is atomic on Atlas (standalone/test falls back to
// sequential idempotent writes, the same policy as convertLegacyPurchase).

import { type ClientSession, Types } from 'mongoose'
import { Debt, type DebtDoc } from './Debt'
import { FinanceTransaction } from './FinanceTransaction'
import { FinanceError } from './errors'
import { insertIdempotent, walletBalances } from './ledger'
import { todayInTz } from '../utils/dates'

const objId = (id: string) => new Types.ObjectId(id)

export type Session = ClientSession | null

/** Remaining amount for a debt (never negative — status flips at exact repay). */
export function outstandingPaise(debt: Pick<DebtDoc, 'originalPaise' | 'repaidPaise'>): number {
  return Math.max(0, debt.originalPaise - debt.repaidPaise)
}

/**
 * Create the debt record for a shared expense. `transactionId` must be the
 * ledger expense that recorded the user's actual out-of-pocket payment.
 * Idempotent via clientToken (safe retries replay the original debt).
 */
export async function createDebtForExpense(
  userId: string,
  doc: {
    person: string
    item: string
    categoryKey?: string | null
    date: string
    originalPaise: number
    transactionId: Types.ObjectId
    note?: string | null
    clientToken?: string | null
  },
  session: Session = null,
): Promise<{ debt: DebtDoc; replayed: boolean }> {
  if (doc.originalPaise <= 0) {
    throw new FinanceError(400, 'VALIDATION_ERROR', 'A debt must be greater than zero')
  }
  try {
    const created = await Debt.create(
      [
        {
          userId: objId(userId),
          person: doc.person,
          item: doc.item,
          categoryKey: doc.categoryKey ?? null,
          date: doc.date,
          originalPaise: doc.originalPaise,
          repaidPaise: 0,
          transactionId: doc.transactionId,
          status: 'outstanding',
          note: doc.note ?? null,
          clientToken: doc.clientToken ?? null,
        },
      ],
      { session },
    )
    return { debt: created[0]!, replayed: false }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      // Replay: same clientToken (retried submit) or same transactionId.
      const existing = doc.clientToken
        ? await Debt.findOne({ userId: objId(userId), clientToken: doc.clientToken }).session(session).lean()
        : await Debt.findOne({ userId: objId(userId), transactionId: doc.transactionId }).session(session).lean()
      if (existing) return { debt: existing as DebtDoc, replayed: true }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Listing + rollups.
// ---------------------------------------------------------------------------

export type DebtStatusFilter = 'outstanding' | 'settled' | 'all'

export async function listDebts(
  userId: string,
  opts: { status?: DebtStatusFilter; person?: string; limit?: number } = {},
): Promise<DebtDoc[]> {
  const q: Record<string, unknown> = { userId: objId(userId) }
  const status = opts.status ?? 'outstanding'
  if (status !== 'all') q.status = status
  if (opts.person) q.person = opts.person
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500)
  return Debt.find(q).sort({ date: -1, _id: -1 }).limit(limit).lean() as Promise<DebtDoc[]>
}

export interface PersonRollup {
  person: string
  outstandingPaise: number
  debtCount: number
}

export interface DebtsSummary {
  totalOutstandingPaise: number
  outstandingCount: number
  people: PersonRollup[]
}

/** Total outstanding + per-person rollup (case-insensitive person grouping). */
export async function summarizeDebts(userId: string): Promise<DebtsSummary> {
  const rows = await Debt.aggregate<{ _id: string; outstandingPaise: number; debtCount: number }>([
    { $match: { userId: objId(userId), status: 'outstanding' } },
    {
      $group: {
        _id: { $toLower: '$person' },
        outstandingPaise: { $sum: { $max: [{ $subtract: ['$originalPaise', '$repaidPaise'] }, 0] } },
        debtCount: { $sum: 1 },
      },
    },
    { $sort: { outstandingPaise: -1 } },
  ])
  // Display name = the most recent casing for that person.
  const display = new Map<string, string>()
  const recent = await Debt.find({ userId: objId(userId), status: 'outstanding' })
    .select('person date')
    .sort({ date: -1, _id: -1 })
    .lean()
  for (const d of recent) {
    const key = d.person.toLowerCase()
    if (!display.has(key)) display.set(key, d.person)
  }
  const people: PersonRollup[] = rows.map((r) => ({
    person: display.get(r._id) ?? r._id,
    outstandingPaise: r.outstandingPaise,
    debtCount: r.debtCount,
  }))
  return {
    totalOutstandingPaise: people.reduce((s, p) => s + p.outstandingPaise, 0),
    outstandingCount: people.reduce((s, p) => s + p.debtCount, 0),
    people,
  }
}

/** Distinct people the user owes (outstanding only) — powers the UI autocomplete. */
export async function listPeople(userId: string): Promise<{ person: string; outstandingPaise: number }[]> {
  const summary = await summarizeDebts(userId)
  return summary.people.map((p) => ({ person: p.person, outstandingPaise: p.outstandingPaise }))
}

/**
 * Phase-1 guard: a shared expense's debt is a real obligation — silently
 * deleting the expense would erase it. Deletion/amount/wallet changes are
 * blocked (the debt itself now has an explicit repay flow instead).
 */
export async function assertTransactionNotDebtLinked(transactionId: string): Promise<void> {
  const linked = await Debt.exists({ transactionId: new Types.ObjectId(transactionId) })
  if (linked) {
    throw new FinanceError(409, 'SHARED_EXPENSE_PROTECTED', 'This expense created a debt and cannot be changed — debts are managed on the Debts page')
  }
}

// ---------------------------------------------------------------------------
// Repayment (Phase 5). repaidPaise is a DERIVED CACHE: the ledger (repayment
// transactions) is the source of truth, mirroring how walletBalances() works.
// Every repayment recomputes repaid from surviving repayment transactions, so
// any future repayment deletion self-heals on the next repayment. Status
// flips to 'settled' exactly when the recomputed total reaches original.
// ---------------------------------------------------------------------------

export interface RepayResult {
  debt: DebtDoc
  replayed: boolean
  walletBalancePaise: number
  settled: boolean
}

/**
 * Apply a repayment: insert the ledger outflow (insertIdempotent handles
 * replays), then recompute repaidPaise/status from ALL repayment txns for
 * the debt. Caller wraps this in withTransaction() and has already validated
 * amount/outstanding/balance.
 */
export async function repayDebt(
  userId: string,
  debtId: string,
  input: { amountPaise: number; walletKey: 'cash' | 'phonepe'; clientToken?: string | null },
  session: Session = null,
): Promise<RepayResult> {
  const debt = await Debt.findOne({ _id: objId(debtId), userId: objId(userId) }).session(session)
  if (!debt) throw new FinanceError(404, 'NOT_FOUND', 'Debt not found')

  // Idempotency probe: a retried submit replays without double-charging.
  if (input.clientToken) {
    const prior = await FinanceTransaction.findOne({
      userId: objId(userId),
      clientToken: input.clientToken,
      type: 'debt_repayment',
      debtId: debt._id,
    })
      .session(session)
      .lean()
    if (prior) {
      const refreshed = await recomputeDebtFromLedger(userId, debtId, session)
      const balances = await walletBalances(userId, session)
      return { debt: refreshed, replayed: true, walletBalancePaise: balances[input.walletKey], settled: refreshed.status === 'settled' }
    }
  }

  const { txn } = await insertIdempotent(
    userId,
    {
      walletKey: input.walletKey,
      type: 'debt_repayment',
      date: todayInTz('Asia/Kolkata'),
      amountPaise: -input.amountPaise,
      item: `Repayment to ${debt.person}`,
      categoryKey: null,
      necessity: null,
      reason: `Debt repayment — ${debt.item}`,
      note: null,
      clientToken: input.clientToken ?? null,
    },
    session,
  )
  // Backfill the debt link (same crash-repair pattern as shared expenses).
  if (String(txn.debtId ?? '') !== String(debt._id)) {
    await FinanceTransaction.updateOne({ _id: txn._id }, { $set: { debtId: debt._id } }, { session: session ?? undefined })
  }

  const updated = await recomputeDebtFromLedger(userId, debtId, session)
  const balances = await walletBalances(userId, session)
  return { debt: updated, replayed: false, walletBalancePaise: balances[input.walletKey], settled: updated.status === 'settled' }
}

/**
 * Recompute a debt's repaidPaise and status from its surviving repayment
 * transactions (ledger = source of truth, like wallet balances). Clamps to
 * [0, originalPaise] — repaid can never go negative or exceed original.
 */
export async function recomputeDebtFromLedger(
  userId: string,
  debtId: string,
  session: Session = null,
): Promise<DebtDoc> {
  const debt = await Debt.findOne({ _id: objId(debtId), userId: objId(userId) }).session(session)
  if (!debt) throw new FinanceError(404, 'NOT_FOUND', 'Debt not found')
  const rows = await FinanceTransaction.find({
    userId: objId(userId),
    type: 'debt_repayment',
    debtId: debt._id,
  })
    .session(session)
    .select('amountPaise')
    .lean()
  const repaid = rows.reduce((sum, r) => sum + Math.abs(r.amountPaise), 0)
  const clamped = Math.min(Math.max(0, repaid), debt.originalPaise)
  debt.repaidPaise = clamped
  debt.status = clamped >= debt.originalPaise ? 'settled' : 'outstanding'
  await debt.save({ session: session ?? undefined })
  return debt
}
