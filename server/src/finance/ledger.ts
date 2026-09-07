import mongoose, { type ClientSession } from 'mongoose'
import { Types } from 'mongoose'
import { DailyRecord } from '../models/DailyRecord'
import { FinanceTransaction, type FinanceTransactionDoc, type TransactionType } from './FinanceTransaction'
import { isWalletKey, walletLabel, categoryLabel } from './registry'
import { FinanceError } from './errors'
import { paiseToRupees } from './money'
import { isValidDateString, todayInTz, weekBounds, monthBounds } from '../utils/dates'

export type Session = ClientSession | null

/**
 * Run a multi-document operation inside a MongoDB transaction when the
 * deployment supports it (Atlas = replica set). Standalone servers (local
 * dev, test Mongo) reject transactions — those run the operation as
 * sequential, idempotent writes instead. Documented limitation (plan §6):
 * a crash mid-sequence in fallback mode can leave a transient orphan that
 * `verifyLedger()` detects and an idempotent re-run repairs.
 */
export async function withTransaction<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  if (mongoose.connection.readyState !== 1) return fn(null)
  let session: ClientSession
  try {
    session = await mongoose.startSession()
  } catch {
    return fn(null)
  }
  try {
    let result!: T
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/transaction numbers are only allowed|transactions are not supported|replica set member or mongos/i.test(msg)) {
      return fn(null)
    }
    throw err
  } finally {
    await session.endSession().catch(() => undefined)
  }
}

const objId = (id: string) => new Types.ObjectId(id)

// ---------------------------------------------------------------------------
// Balances — always derived from the ledger, never cached.
// ---------------------------------------------------------------------------

export async function walletBalances(userId: string, session: Session = null): Promise<Record<'cash' | 'phonepe', number>> {
  const rows = await FinanceTransaction.aggregate([
    { $match: { userId: objId(userId) } },
    { $group: { _id: '$walletKey', total: { $sum: '$amountPaise' } } },
  ]).session(session)
  const out: Record<'cash' | 'phonepe', number> = { cash: 0, phonepe: 0 }
  for (const row of rows) {
    const key = row._id as string
    if (key === 'cash' || key === 'phonepe') out[key] = row.total as number
  }
  return out
}

/** Sum of a wallet's ledger excluding one transaction (for edit projections). */
async function walletBalanceExcluding(userId: string, walletKey: 'cash' | 'phonepe', excludeId: string, session: Session = null): Promise<number> {
  const rows = await FinanceTransaction.aggregate([
    { $match: { userId: objId(userId), walletKey, _id: { $ne: objId(excludeId) } } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ]).session(session)
  return (rows[0]?.total as number) ?? 0
}

function assertNonNegative(balance: number, walletKey: string): void {
  if (balance < 0) {
    throw new FinanceError(409, 'NEGATIVE_BALANCE', `This change would make ${walletLabel(walletKey)} go negative`, {
      walletKey,
      projectedBalancePaise: balance,
    })
  }
}

// ---------------------------------------------------------------------------
// Idempotent creation — a repeated submit returns the original transaction.
// ---------------------------------------------------------------------------

export async function insertIdempotent(
  userId: string,
  doc: {
    walletKey: 'cash' | 'phonepe'
    type: TransactionType
    date: string
    amountPaise: number
    source?: string | null
    item?: string | null
    categoryKey?: string | null
    necessity?: 'necessary' | 'optional' | 'wasteful' | null
    reason?: string | null
    note?: string | null
    clientToken?: string | null
  },
): Promise<{ txn: FinanceTransactionDoc; replayed: boolean }> {
  try {
    const created = await FinanceTransaction.create([{ ...doc, userId: objId(userId) }])
    return { txn: created[0]!, replayed: false }
  } catch (err) {
    if ((err as { code?: number }).code === 11000 && doc.clientToken) {
      const existing = await FinanceTransaction.findOne({ userId: objId(userId), clientToken: doc.clientToken }).lean()
      if (existing) return { txn: existing as FinanceTransactionDoc, replayed: true }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Opening balance — foundation of the ledger, corrected only with an audit trail.
// ---------------------------------------------------------------------------

export async function hasOpeningBalance(userId: string): Promise<Record<'cash' | 'phonepe', boolean>> {
  const rows = await FinanceTransaction.find({ userId: objId(userId), type: 'opening_balance' }).select('walletKey').lean()
  const out: Record<'cash' | 'phonepe', boolean> = { cash: false, phonepe: false }
  for (const r of rows) {
    if (r.walletKey === 'cash' || r.walletKey === 'phonepe') out[r.walletKey] = true
  }
  return out
}

export async function setOpeningBalance(
  userId: string,
  walletKey: 'cash' | 'phonepe',
  amountPaise: number,
  opts: { acknowledged?: boolean; previousAmountPaise?: number; date?: string },
): Promise<{ txn: FinanceTransactionDoc; created: boolean; balanceImpactPaise: number }> {
  const existing = await FinanceTransaction.findOne({ userId: objId(userId), walletKey, type: 'opening_balance' }).lean()
  if (!existing) {
    if (amountPaise < 0) throw new FinanceError(400, 'VALIDATION_ERROR', 'Opening balance cannot be negative')
    const { txn } = await insertIdempotent(userId, {
      walletKey,
      type: 'opening_balance',
      date: opts.date ?? todayInTz('Asia/Kolkata'),
      amountPaise,
    })
    return { txn, created: true, balanceImpactPaise: amountPaise }
  }

  // Correction — the client must have shown current → new → impact and confirmed.
  const previousAmountPaise = existing.amountPaise
  if (opts.acknowledged !== true || opts.previousAmountPaise !== previousAmountPaise) {
    throw new FinanceError(400, 'CONFIRMATION_REQUIRED', 'Correcting an opening balance requires explicit confirmation of the shown impact')
  }
  const projected = (await walletBalances(userId))[walletKey] - previousAmountPaise + amountPaise
  assertNonNegative(projected, walletKey)
  // Single atomic update: push the audit entry and set the new amount.
  const txn = (await FinanceTransaction.findOneAndUpdate(
    { _id: existing._id },
    {
      $push: { history: { amountPaise: previousAmountPaise, changedAt: new Date() } },
      $set: { amountPaise },
    },
    { new: true },
  ).lean()) as FinanceTransactionDoc
  return { txn, created: false, balanceImpactPaise: amountPaise - previousAmountPaise }
}

// ---------------------------------------------------------------------------
// Balance adjustment (wallet reconciliation).
// ---------------------------------------------------------------------------

export async function createAdjustment(
  userId: string,
  walletKey: 'cash' | 'phonepe',
  deltaPaise: number,
  reason: string,
  date: string,
): Promise<FinanceTransactionDoc> {
  const projected = (await walletBalances(userId))[walletKey] + deltaPaise
  assertNonNegative(projected, walletKey)
  const { txn } = await insertIdempotent(userId, {
    walletKey,
    type: 'balance_adjustment',
    date,
    amountPaise: deltaPaise,
    reason,
  })
  return txn
}

// ---------------------------------------------------------------------------
// Transactions — edit / delete with the no-negative-balance invariant.
// ---------------------------------------------------------------------------

export async function getTransaction(userId: string, id: string): Promise<FinanceTransactionDoc> {
  const txn = await FinanceTransaction.findOne({ _id: id, userId: objId(userId) }).lean()
  if (!txn) throw new FinanceError(404, 'NOT_FOUND', 'Transaction not found')
  return txn as unknown as FinanceTransactionDoc
}

export async function updateTransaction(
  userId: string,
  id: string,
  patch: { amountPaise?: number; walletKey?: 'cash' | 'phonepe'; date?: string; item?: string; categoryKey?: string; necessity?: 'necessary' | 'optional' | 'wasteful'; source?: string; reason?: string; note?: string },
): Promise<FinanceTransactionDoc> {
  const txn = await getTransaction(userId, id)
  if (txn.type === 'opening_balance') {
    throw new FinanceError(409, 'OPENING_BALANCE_PROTECTED', 'Opening balances are corrected through the dedicated opening-balance flow')
  }
  const newWallet = patch.walletKey ?? txn.walletKey
  // The API speaks in positive amounts; the ledger stores signed values.
  // Normalise by type so an edit never flips an outflow into an inflow.
  const newAmount =
    patch.amountPaise !== undefined
      ? txn.type === 'expense'
        ? -Math.abs(patch.amountPaise)
        : Math.abs(patch.amountPaise)
      : txn.amountPaise

  // Invariant: no wallet may go negative after this edit. When the wallet
  // changes, both the source (loses the transaction) and the destination
  // (gains it) must be checked.
  if (patch.walletKey !== undefined && patch.walletKey !== txn.walletKey) {
    const sourceBalance = (await walletBalances(userId))[txn.walletKey] ?? 0
    assertNonNegative(sourceBalance - txn.amountPaise, txn.walletKey)
  }
  const destinationBalance = (await walletBalances(userId))[newWallet] ?? 0
  const projected =
    newWallet === txn.walletKey
      ? destinationBalance - txn.amountPaise + newAmount
      : destinationBalance + newAmount
  assertNonNegative(projected, newWallet)

  const $set: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) $set[key] = key === 'amountPaise' ? newAmount : value
  }
  const updated = (await FinanceTransaction.findOneAndUpdate({ _id: txn._id }, { $set }, { new: true }).lean()) as FinanceTransactionDoc
  return updated
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const txn = await getTransaction(userId, id)
  if (txn.type === 'opening_balance') {
    throw new FinanceError(409, 'OPENING_BALANCE_PROTECTED', 'Opening balances cannot be deleted — correct them instead')
  }
  // Invariant: removing this transaction must not negative its wallet
  // (e.g. deleting an inflow that earlier expenses depended on).
  const balance = await walletBalanceExcluding(userId, txn.walletKey, id)
  assertNonNegative(balance, txn.walletKey)
  await FinanceTransaction.deleteOne({ _id: txn._id, userId: objId(userId) })
}

// ---------------------------------------------------------------------------
// Listing.
// ---------------------------------------------------------------------------

export interface TransactionFilters {
  type?: TransactionType
  walletKey?: 'cash' | 'phonepe'
  categoryKey?: string
  necessity?: 'necessary' | 'optional' | 'wasteful'
  source?: string
  date?: string
  from?: string | null
  to?: string | null
  limit?: number
  cursor?: string | null
}

export async function listTransactions(userId: string, f: TransactionFilters): Promise<{ transactions: FinanceTransactionDoc[]; nextCursor: string | null }> {
  const q: Record<string, unknown> = { userId: objId(userId) }
  if (f.type) q.type = f.type
  if (f.walletKey) q.walletKey = f.walletKey
  if (f.categoryKey) q.categoryKey = f.categoryKey
  if (f.necessity) q.necessity = f.necessity
  if (f.source) q.source = f.source
  if (f.date) q.date = f.date
  if (f.from || f.to) {
    const range: Record<string, string> = {}
    if (f.from) range.$gte = f.from
    if (f.to) range.$lte = f.to
    q.date = range
  }
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500)
  if (f.cursor) q._id = { $lt: new Types.ObjectId(f.cursor) }
  const transactions = await FinanceTransaction.find(q).sort({ date: -1, _id: -1 }).limit(limit + 1)
  const hasMore = transactions.length > limit
  const page = hasMore ? transactions.slice(0, limit) : transactions
  return { transactions: page, nextCursor: hasMore ? String(page.at(-1)!._id) : null }
}

// ---------------------------------------------------------------------------
// Merged purchase view (plan §11) — legacy embedded purchases without a
// transactionId, plus ledger expenses dated that day. Exactly one entry per
// real-world expense reaches scoring.
// ---------------------------------------------------------------------------

export interface MergedPurchase {
  item: string
  amount: number // rupees — the shape computeScore() already consumes
  category: string
  necessary: boolean
  notes?: string
}

export async function mergedPurchasesForDate(userId: string, date: string): Promise<MergedPurchase[]> {
  const [record, expenses] = await Promise.all([
    DailyRecord.findOne({ userId: objId(userId), date }).select('purchases').lean(),
    FinanceTransaction.find({ userId: objId(userId), type: 'expense', date }).lean(),
  ])
  const embedded = (record?.purchases ?? [])
    .filter((p) => !p.transactionId)
    .map((p) => ({
      item: p.item,
      amount: p.amount,
      category: p.category,
      necessary: p.necessary !== false,
      notes: p.notes ?? undefined,
    }))
  const ledger = expenses.map((t) => ({
    item: t.item ?? 'Expense',
    amount: paiseToRupees(Math.abs(t.amountPaise)),
    category: categoryLabel(t.categoryKey ?? 'other'),
    necessary: t.necessity === 'necessary',
    notes: t.note ?? undefined,
  }))
  return [...embedded, ...ledger]
}

/** Ledger expenses for a date range, grouped by date — for insights routes. */
export async function ledgerExpensesForRange(userId: string, from: string, to: string): Promise<Map<string, MergedPurchase[]>> {
  const expenses = await FinanceTransaction.find({ userId: objId(userId), type: 'expense', date: { $gte: from, $lte: to } }).lean()
  const byDate = new Map<string, MergedPurchase[]>()
  for (const t of expenses) {
    const list = byDate.get(t.date) ?? []
    list.push({
      item: t.item ?? 'Expense',
      amount: paiseToRupees(Math.abs(t.amountPaise)),
      category: categoryLabel(t.categoryKey ?? 'other'),
      necessary: t.necessity === 'necessary',
      notes: t.note ?? undefined,
    })
    byDate.set(t.date, list)
  }
  return byDate
}

/** Merge a set of records' embedded purchases with ledger expenses per date. */
export function mergeEmbeddedWithLedger(
  records: { date: string; purchases?: { item: string; amount: number; category: string; necessary: boolean; notes?: string | null; transactionId?: unknown }[] }[],
  ledgerByDate: Map<string, MergedPurchase[]>,
): Map<string, MergedPurchase[]> {
  const out = new Map<string, MergedPurchase[]>()
  for (const r of records) {
    const list: MergedPurchase[] = (r.purchases ?? [])
      .filter((p) => !p.transactionId)
      .map((p) => ({
        item: p.item,
        amount: p.amount,
        category: p.category,
        necessary: p.necessary !== false,
        notes: p.notes ?? undefined,
      }))
    for (const l of ledgerByDate.get(r.date) ?? []) list.push(l)
    if (list.length > 0) out.set(r.date, list)
  }
  // Ledger expenses on dates with no day record at all.
  for (const [date, list] of ledgerByDate) {
    if (!out.has(date)) out.set(date, list)
  }
  return out
}

// ---------------------------------------------------------------------------
// Clear-day — used by DELETE /days/:date to remove a date's ledger expenses
// together with the day record (one transaction on Atlas).
// ---------------------------------------------------------------------------

export async function clearDayExpenses(userId: string, date: string, session: Session = null): Promise<number> {
  const res = await FinanceTransaction.deleteMany({ userId: objId(userId), type: 'expense', date }).session(session)
  return res.deletedCount ?? 0
}

// ---------------------------------------------------------------------------
// Legacy purchase conversion — the only two-write operation (plan §0).
// Idempotent: an already-stamped purchase is skipped.
// ---------------------------------------------------------------------------

export async function convertLegacyPurchase(
  userId: string,
  date: string,
  index: number,
  walletKey: 'cash' | 'phonepe',
  expectedItem?: string,
): Promise<{ txn: FinanceTransactionDoc | null; alreadyConverted: boolean }> {
  return withTransaction(async (session) => {
    const record = await DailyRecord.findOne({ userId: objId(userId), date }).session(session)
    if (!record) throw new FinanceError(404, 'NOT_FOUND', 'No day record for this date')
    const purchase = record.purchases[index]
    if (!purchase) throw new FinanceError(404, 'NOT_FOUND', 'Purchase not found at this index')
    if (purchase.transactionId) {
      const existing = await FinanceTransaction.findOne({ _id: purchase.transactionId, userId: objId(userId) }).session(session)
      return { txn: (existing as FinanceTransactionDoc) ?? null, alreadyConverted: true }
    }
    if (expectedItem !== undefined && purchase.item !== expectedItem) {
      throw new FinanceError(409, 'CONFLICT', 'The purchase changed since it was listed — refresh and retry')
    }
    const amountPaise = -Math.round(Math.abs(purchase.amount) * 100)
    const { txn } = await insertIdempotent(
      userId,
      {
        walletKey,
        type: 'expense',
        date,
        amountPaise,
        item: purchase.item,
        categoryKey: 'other',
        necessity: purchase.necessary === false ? 'optional' : 'necessary',
        note: purchase.category ? `Converted from Things Bought (category: ${purchase.category})` : 'Converted from Things Bought',
      },
    )
    await DailyRecord.updateOne({ _id: record._id }, { $set: { [`purchases.${index}.transactionId`]: txn._id } }).session(session)
    return { txn, alreadyConverted: false }
  })
}

// ---------------------------------------------------------------------------
// Verify — ledger consistency report.
// ---------------------------------------------------------------------------

export interface VerifyResult {
  ok: boolean
  wallets: { key: string; balancePaise: number; transactions: number }[]
  issues: string[]
}

export async function verifyLedger(userId: string): Promise<VerifyResult> {
  const issues: string[] = []
  const balances = await walletBalances(userId)
  const counts = await FinanceTransaction.aggregate([
    { $match: { userId: objId(userId) } },
    { $group: { _id: '$walletKey', count: { $sum: 1 } } },
  ])
  const wallets = (['cash', 'phonepe'] as const).map((key) => ({
    key,
    balancePaise: balances[key],
    transactions: counts.find((c) => c._id === key)?.count ?? 0,
  }))

  const today = todayInTz('Asia/Kolkata')
  const futureCount = await FinanceTransaction.countDocuments({ userId: objId(userId), date: { $gt: today } })
  if (futureCount > 0) issues.push(`${futureCount} transaction(s) dated in the future`)

  // Stamped purchases pointing at transactions that no longer exist.
  const records = await DailyRecord.find({ userId: objId(userId) }).select('date purchases').lean()
  const txnIds = new Set<string>()
  const allTxns = await FinanceTransaction.find({ userId: objId(userId) }).select('_id').lean()
  for (const t of allTxns) txnIds.add(String(t._id))
  for (const r of records) {
    for (const p of r.purchases) {
      if (p.transactionId && !txnIds.has(String(p.transactionId))) {
        issues.push(`Purchase "${p.item}" on ${r.date} references a missing transaction`)
      }
    }
    if (!isValidDateString(r.date)) issues.push(`Day record has invalid date ${r.date}`)
  }

  for (const w of wallets) {
    if (w.balancePaise < 0) issues.push(`${walletLabel(w.key)} balance is negative (${w.balancePaise} paise)`)
  }

  return { ok: issues.length === 0, wallets, issues }
}

// ---------------------------------------------------------------------------
// Overview — balances + today/week/month spend + threshold flags.
// ---------------------------------------------------------------------------

export interface OverviewWallet {
  key: 'cash' | 'phonepe'
  label: string
  balancePaise: number
  alertThresholdPaise: number
  low: boolean
  hasOpeningBalance: boolean
  /** Amount of the opening-balance transaction, when one exists. */
  openingBalancePaise: number | null
}

export async function getOverview(
  userId: string,
  settings: { weekStartsOn: number; timezone: string; alertThresholdPaise: { cash: number; phonepe: number } },
): Promise<{
  today: string
  wallets: OverviewWallet[]
  totalBalancePaise: number
  spent: { todayPaise: number; weekPaise: number; monthPaise: number }
}> {
  const today = todayInTz(settings.timezone)
  const week = weekBounds(today, (settings.weekStartsOn ?? 1) as 0 | 1)
  const month = monthBounds(today)

  const [balances, openingRows, spentToday, spentWeek, spentMonth] = await Promise.all([
    walletBalances(userId),
    FinanceTransaction.find({ userId: objId(userId), type: 'opening_balance' }).select('walletKey amountPaise').lean(),
    sumExpenses(userId, today, today),
    sumExpenses(userId, week.start, week.end),
    sumExpenses(userId, month.start, month.end),
  ])
  const opening: Record<'cash' | 'phonepe', { has: boolean; amountPaise: number }> = {
    cash: { has: false, amountPaise: 0 },
    phonepe: { has: false, amountPaise: 0 },
  }
  for (const row of openingRows) {
    if (row.walletKey === 'cash' || row.walletKey === 'phonepe') {
      opening[row.walletKey] = { has: true, amountPaise: row.amountPaise }
    }
  }

  const wallets: OverviewWallet[] = (['cash', 'phonepe'] as const).map((key) => ({
    key,
    label: walletLabel(key),
    balancePaise: balances[key],
    alertThresholdPaise: settings.alertThresholdPaise?.[key] ?? 0,
    // Never warn about a wallet the user has not set up.
    low: (settings.alertThresholdPaise?.[key] ?? 0) > 0 && opening[key].has && balances[key] < (settings.alertThresholdPaise?.[key] ?? 0),
    hasOpeningBalance: opening[key].has,
    openingBalancePaise: opening[key].has ? opening[key].amountPaise : null,
  }))

  return {
    today,
    wallets,
    totalBalancePaise: balances.cash + balances.phonepe,
    spent: { todayPaise: spentToday, weekPaise: spentWeek, monthPaise: spentMonth },
  }
}

/** Total spent (absolute) across wallets in [from, to]. */
export async function sumExpenses(userId: string, from: string, to: string): Promise<number> {
  const rows = await FinanceTransaction.aggregate([
    { $match: { userId: objId(userId), type: 'expense', date: { $gte: from, $lte: to } } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ])
  return Math.abs((rows[0]?.total as number) ?? 0)
}
