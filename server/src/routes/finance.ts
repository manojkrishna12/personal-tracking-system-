import { Router } from 'express'
import { Types } from 'mongoose'
import { User } from '../models/User'
import { DailyRecord } from '../models/DailyRecord'
import {
  walletBalances,
  getOverview,
  setOpeningBalance,
  createAdjustment,
  insertIdempotent,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  listTransactions,
  verifyLedger,
  convertLegacyPurchase,
  hasOpeningBalance,
  type TransactionFilters,
} from '../finance/ledger'
import { computeAnalytics, computeDadReport } from '../finance/analytics'
import { computeFinanceInsights } from '../finance/insights'
import { FinanceTransaction, TRANSACTION_TYPES, type TransactionType } from '../finance/FinanceTransaction'
import { isWalletKey, walletLabel } from '../finance/registry'
import { resolvePeriod, PERIODS, type PeriodName, type PeriodRange } from '../finance/periods'
import { FinanceError } from '../finance/errors'
import { paiseToRupees } from '../finance/money'
import { restampDayScore } from '../finance/scoreSync'
import {
  openingBalanceSchema,
  adjustmentSchema,
  moneyInSchema,
  expenseSchema,
  transactionPatchSchema,
  financeSettingsSchema,
  convertLegacySchema,
} from '../validation/schemas'
import { validate } from '../middleware/validate'
import type { AuthRequest } from '../middleware/auth'
import { isFutureDate, isValidDateString, todayInTz } from '../utils/dates'

const router = Router()

const objId = (id: string) => new Types.ObjectId(id)

interface UserLike {
  settings?: {
    timezone?: string
    weekStartsOn?: number
    finance?: { alertThresholdPaise?: { cash?: number; phonepe?: number } }
  }
}

async function loadUser(userId: string): Promise<UserLike> {
  const user = await User.findById(userId).lean()
  if (!user) throw new FinanceError(404, 'USER_NOT_FOUND', 'User not found')
  return user as unknown as UserLike
}

function todayFor(user: UserLike): string {
  return todayInTz(user.settings?.timezone ?? 'Asia/Kolkata')
}

function rejectFuture(date: string, today: string): void {
  if (isFutureDate(date, today)) {
    throw new FinanceError(400, 'FUTURE_DATE', 'Future financial transactions cannot be recorded')
  }
}

function weekStartsOnOf(user: UserLike): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (user.settings?.weekStartsOn ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6
}

function thresholdsOf(user: UserLike): { cash: number; phonepe: number } {
  return {
    cash: user.settings?.finance?.alertThresholdPaise?.cash ?? 50_000,
    phonepe: user.settings?.finance?.alertThresholdPaise?.phonepe ?? 30_000,
  }
}

/** Parse ?period=&from=&to= into a PeriodRange (custom allowed). */
function parseRange(query: Record<string, unknown>, today: string, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6): { range: PeriodRange; period: PeriodName } {
  const rawPeriod = String(query.period ?? '')
  const from = typeof query.from === 'string' && isValidDateString(query.from) ? query.from : null
  const to = typeof query.to === 'string' && isValidDateString(query.to) ? query.to : null

  if ((PERIODS as readonly string[]).includes(rawPeriod)) {
    const period = rawPeriod as PeriodName
    const range = resolvePeriod(period, today, weekStartsOn, { from, to })
    if (period === 'custom' && !from && !to) {
      throw new FinanceError(400, 'VALIDATION_ERROR', 'Custom period requires from and/or to dates')
    }
    return { range, period }
  }
  if (rawPeriod) throw new FinanceError(400, 'VALIDATION_ERROR', `Unknown period: ${rawPeriod}`)
  // No period named — fall back to explicit from/to, or all time.
  return { range: { from, to }, period: from || to ? 'custom' : 'all' }
}

// ---------------------------------------------------------------------------
// Overview — balances, spend strip, low-balance flags, opening-balance state.
// ---------------------------------------------------------------------------

router.get('/overview', async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const overview = await getOverview(req.user!.id, {
    weekStartsOn: weekStartsOnOf(user),
    timezone: user.settings?.timezone ?? 'Asia/Kolkata',
    alertThresholdPaise: thresholdsOf(user),
  })
  res.json({ data: overview })
})

// ---------------------------------------------------------------------------
// Finance settings — wallet alert thresholds.
// ---------------------------------------------------------------------------

router.put('/settings', validate(financeSettingsSchema), async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.id)
  if (!user) throw new FinanceError(404, 'USER_NOT_FOUND', 'User not found')
  user.settings = {
    ...user.settings,
    finance: { alertThresholdPaise: req.body.alertThresholdPaise },
  } as typeof user.settings
  await user.save()
  res.json({ data: { alertThresholdPaise: thresholdsOf(user as unknown as UserLike) } })
})

// ---------------------------------------------------------------------------
// Opening balance — create, or correct with explicit confirmation + audit.
// ---------------------------------------------------------------------------

router.put('/opening-balance', validate(openingBalanceSchema), async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const today = todayFor(user)
  if (req.body.date) rejectFuture(req.body.date as string, today)
  const walletKey = req.body.walletKey as 'cash' | 'phonepe'
  const { walletKey: _wk, amountPaise, acknowledged, previousAmountPaise, date } = req.body
  const result = await setOpeningBalance(req.user!.id, walletKey, amountPaise, { acknowledged, previousAmountPaise, date })
  const balances = await walletBalances(req.user!.id)
  res.json({
    data: {
      transaction: result.txn,
      created: result.created,
      previousAmountPaise: result.created ? null : (result.txn.history?.at(-1)?.amountPaise ?? null),
      balanceImpactPaise: result.created ? amountPaise : amountPaise - (result.txn.history?.at(-1)?.amountPaise ?? 0),
      walletBalancePaise: balances[walletKey],
    },
  })
})

// ---------------------------------------------------------------------------
// Balance adjustment (wallet reconciliation) — required reason, never overwrites.
// ---------------------------------------------------------------------------

router.post('/adjustment', validate(adjustmentSchema), async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const walletKey = req.body.walletKey as 'cash' | 'phonepe'
  const date = (req.body.date as string | undefined) ?? todayFor(user)
  rejectFuture(date, todayFor(user))
  const balancesBefore = await walletBalances(req.user!.id)
  const txn = await createAdjustment(req.user!.id, walletKey, req.body.deltaPaise, req.body.reason, date)
  const balancesAfter = await walletBalances(req.user!.id)
  res.status(201).json({
    data: {
      transaction: txn,
      balanceBeforePaise: balancesBefore[walletKey],
      balanceAfterPaise: balancesAfter[walletKey],
    },
  })
})

// ---------------------------------------------------------------------------
// Money in / expenses — idempotent via clientToken (safe retries replay).
// ---------------------------------------------------------------------------

router.post('/money-in', validate(moneyInSchema), async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  rejectFuture(req.body.date as string, todayFor(user))
  const walletKey = req.body.walletKey as 'cash' | 'phonepe'
  const { amountPaise, source, date, note, clientToken } = req.body
  const { txn, replayed } = await insertIdempotent(req.user!.id, {
    walletKey,
    type: 'money_received',
    date,
    amountPaise,
    source,
    note: note ?? null,
    clientToken: clientToken ?? null,
  })
  const balances = await walletBalances(req.user!.id)
  res.status(replayed ? 200 : 201).json({ data: { transaction: txn, replayed, walletBalancePaise: balances[walletKey] } })
})

router.post('/expenses', validate(expenseSchema), async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  rejectFuture(req.body.date as string, todayFor(user))
  const walletKey = req.body.walletKey as 'cash' | 'phonepe'
  const { item, amountPaise, categoryKey, necessity, date, note, clientToken } = req.body

  // Overdraft guard — server is authoritative (plan §9).
  const balances = await walletBalances(req.user!.id)
  if (balances[walletKey] < amountPaise) {
    throw new FinanceError(409, 'INSUFFICIENT_BALANCE', `Insufficient ${walletLabel(walletKey)} balance`, {
      walletKey,
      balancePaise: balances[walletKey],
      requestedPaise: amountPaise,
    })
  }

  const { txn, replayed } = await insertIdempotent(req.user!.id, {
    walletKey,
    type: 'expense',
    date,
    amountPaise: -amountPaise, // stored signed: expense = outflow
    item,
    categoryKey,
    necessity,
    note: note ?? null,
    clientToken: clientToken ?? null,
  })
  // Keep the day's score in sync with the merged purchase view (plan §0).
  await restampDayScore(req.user!.id, date)
  const after = await walletBalances(req.user!.id)
  res.status(replayed ? 200 : 201).json({ data: { transaction: txn, replayed, walletBalancePaise: after[walletKey] } })
})

// ---------------------------------------------------------------------------
// Transaction list + edit/delete (opening balances protected).
// ---------------------------------------------------------------------------

router.get('/transactions', async (req: AuthRequest, res) => {
  const f: TransactionFilters = {}
  const q = req.query as Record<string, string | undefined>
  if (q.type) {
    if (!(TRANSACTION_TYPES as readonly string[]).includes(q.type)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid transaction type' } })
      return
    }
    f.type = q.type as TransactionType
  }
  if (q.walletKey) {
    if (!isWalletKey(q.walletKey)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet' } })
      return
    }
    f.walletKey = q.walletKey
  }
  if (q.categoryKey) f.categoryKey = q.categoryKey
  if (q.necessity === 'necessary' || q.necessity === 'optional' || q.necessity === 'wasteful') f.necessity = q.necessity
  if (q.source) f.source = q.source
  if (q.date) {
    if (!isValidDateString(q.date)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be YYYY-MM-DD' } })
      return
    }
    f.date = q.date
  }
  if (q.from) {
    if (!isValidDateString(q.from)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from must be YYYY-MM-DD' } })
      return
    }
    f.from = q.from
  }
  if (q.to) {
    if (!isValidDateString(q.to)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'to must be YYYY-MM-DD' } })
      return
    }
    f.to = q.to
  }
  if (q.limit) f.limit = Number(q.limit)
  if (q.cursor) f.cursor = q.cursor
  const result = await listTransactions(req.user!.id, f)
  res.json({ data: result })
})

router.get('/transactions/:id', async (req: AuthRequest, res) => {
  const txn = await getTransaction(req.user!.id, req.params.id as string)
  res.json({ data: { transaction: txn } })
})

router.put('/transactions/:id', validate(transactionPatchSchema), async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  if (req.body.date) rejectFuture(req.body.date as string, todayFor(user))
  const before = await getTransaction(req.user!.id, req.params.id as string)
  const txn = await updateTransaction(req.user!.id, req.params.id as string, req.body)
  if (txn.type === 'expense') {
    await restampDayScore(req.user!.id, before.date)
    if (before.date !== txn.date) await restampDayScore(req.user!.id, txn.date)
  }
  const balances = await walletBalances(req.user!.id)
  res.json({ data: { transaction: txn, walletBalancePaise: balances[txn.walletKey] } })
})

router.delete('/transactions/:id', async (req: AuthRequest, res) => {
  const txn = await getTransaction(req.user!.id, req.params.id as string)
  await deleteTransaction(req.user!.id, req.params.id as string)
  if (txn.type === 'expense') await restampDayScore(req.user!.id, txn.date)
  res.status(204).end()
})

// ---------------------------------------------------------------------------
// Analytics / insights / Dad report.
// ---------------------------------------------------------------------------

router.get('/analytics', async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const { range, period } = parseRange(req.query as Record<string, unknown>, todayFor(user), weekStartsOnOf(user))
  const withPrev = period === 'this_week' || period === 'last_week' || period === 'this_month' || period === 'last_month' || period === 'custom'
  const result = await computeAnalytics(req.user!.id, range, { withPrevComparison: withPrev })
  res.json({ data: result })
})

router.get('/insights', async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const { range, period } = parseRange(req.query as Record<string, unknown>, todayFor(user), weekStartsOnOf(user))
  const withPrev = period === 'this_week' || period === 'last_week' || period === 'this_month' || period === 'last_month' || period === 'custom'
  const analytics = await computeAnalytics(req.user!.id, range, { withPrevComparison: withPrev })
  const opening = await hasOpeningBalance(req.user!.id)
  const result = await computeFinanceInsights(req.user!.id, period, range, analytics, { alertThresholdPaise: thresholdsOf(user) }, opening)
  res.json({ data: result })
})

router.get('/reports/dad', async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const { range } = parseRange(req.query as Record<string, unknown>, todayFor(user), weekStartsOnOf(user))
  const source = typeof req.query.source === 'string' && req.query.source.trim() ? req.query.source.trim().slice(0, 60) : 'Dad'
  const balances = await walletBalances(req.user!.id)
  const report = await computeDadReport(req.user!.id, range, source, balances.cash + balances.phonepe)
  res.json({ data: report })
})

// ---------------------------------------------------------------------------
// Legacy purchase review — nothing is auto-migrated (plan §11).
// ---------------------------------------------------------------------------

router.get('/legacy-purchases', async (req: AuthRequest, res) => {
  const records = await DailyRecord.find({ userId: objId(req.user!.id) }).sort({ date: -1 }).lean()
  const pending: { date: string; index: number; item: string; amount: number; category: string; necessary: boolean }[] = []
  for (const r of records) {
    r.purchases.forEach((p, index) => {
      if (!p.transactionId) {
        pending.push({ date: r.date, index, item: p.item, amount: p.amount, category: p.category, necessary: p.necessary !== false })
      }
    })
  }
  res.json({ data: { purchases: pending } })
})

router.post('/legacy-purchases/convert', validate(convertLegacySchema), async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  rejectFuture(req.body.date as string, todayFor(user))
  const walletKey = req.body.walletKey as 'cash' | 'phonepe'
  const result = await convertLegacyPurchase(req.user!.id, req.body.date, req.body.index, walletKey, req.body.expectedItem)
  await restampDayScore(req.user!.id, req.body.date)
  const balances = await walletBalances(req.user!.id)
  res.json({ data: { ...result, walletBalancePaise: balances[walletKey] } })
})

// ---------------------------------------------------------------------------
// Verify + CSV export.
// ---------------------------------------------------------------------------

router.get('/verify', async (req: AuthRequest, res) => {
  const result = await verifyLedger(req.user!.id)
  res.json({ data: result })
})

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

router.get('/export.csv', async (req: AuthRequest, res) => {
  const user = await loadUser(req.user!.id)
  const { range } = parseRange(req.query as Record<string, unknown>, todayFor(user), weekStartsOnOf(user))
  const q: Record<string, unknown> = { userId: objId(req.user!.id) }
  if (range.from || range.to) {
    const rangeQ: Record<string, string> = {}
    if (range.from) rangeQ.$gte = range.from
    if (range.to) rangeQ.$lte = range.to
    q.date = rangeQ
  }
  const txns = await FinanceTransaction.find(q).sort({ date: 1, _id: 1 }).lean()
  const { walletLabel: wl, categoryLabel: cl } = await import('../finance/registry')

  const header = ['Date', 'Type', 'Item', 'Amount', 'Wallet', 'Category', 'Necessity', 'Source', 'Note']
  const lines = [header.join(',')]
  for (const t of txns) {
    const rupees = paiseToRupees(t.amountPaise).toFixed(2)
    const row = [
      t.date,
      t.type,
      t.item ?? '',
      rupees,
      wl(t.walletKey),
      t.categoryKey ? cl(t.categoryKey) : '',
      t.necessity ?? '',
      t.source ?? '',
      t.note ?? t.reason ?? '',
    ].map((v) => csvEscape(String(v)))
    lines.push(row.join(','))
  }
  // UTF-8 BOM + CRLF → Excel / Google Sheets friendly.
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="selftrack-transactions${range.from ? `-${range.from}_${range.to ?? 'open'}` : '-all'}.csv"`)
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`)
})

export default router
