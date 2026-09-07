import { Types } from 'mongoose'
import { FinanceTransaction, type FinanceTransactionDoc } from './FinanceTransaction'
import { categoryGroup, categoryLabel, walletLabel } from './registry'
import type { PeriodRange } from './periods'
import { previousPeriod } from './periods'

const objId = (id: string) => new Types.ObjectId(id)

export interface AnalyticsResult {
  from: string | null
  to: string | null
  totals: { receivedPaise: number; spentPaise: number; adjustmentsPaise: number; netFlowPaise: number }
  byWallet: { key: string; label: string; spentPaise: number; receivedPaise: number }[]
  byCategory: { key: string; label: string; spentPaise: number; count: number }[]
  byNecessity: { necessaryPaise: number; optionalPaise: number; wastefulPaise: number; necessaryCount: number; optionalCount: number; wastefulCount: number }
  food: { totalPaise: number; count: number; wastefulPaise: number; byCategory: { key: string; label: string; spentPaise: number; count: number }[] }
  dailySeries: { date: string; spentPaise: number }[]
  moneyFlow: {
    openingPaise: number
    receivedPaise: number
    availablePaise: number
    expensesPaise: number
    adjustmentsPaise: number
    endingPaise: number
  } | null // null when the period is unbounded (all time)
  largestExpense: { item: string; amountPaise: number; date: string } | null
  counts: { expenses: number; receivedTransactions: number }
  prevComparison: { prevSpentPaise: number; changePct: number | null } | null
}

function dateFilter(range: PeriodRange): Record<string, unknown> {
  if (!range.from && !range.to) return {}
  const rangeQ: Record<string, string> = {}
  if (range.from) rangeQ.$gte = range.from
  if (range.to) rangeQ.$lte = range.to
  return { date: rangeQ }
}

async function sumBefore(userId: string, date: string): Promise<number> {
  const rows = await FinanceTransaction.aggregate([
    { $match: { userId: objId(userId), date: { $lt: date } } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ])
  return (rows[0]?.total as number) ?? 0
}

async function sumThrough(userId: string, date: string | null): Promise<number> {
  const match: Record<string, unknown> = { userId: objId(userId) }
  if (date) match.date = { $lte: date }
  const rows = await FinanceTransaction.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ])
  return (rows[0]?.total as number) ?? 0
}

export async function computeAnalytics(
  userId: string,
  range: PeriodRange,
  opts: { withPrevComparison?: boolean } = {},
): Promise<AnalyticsResult> {
  const txns = (await FinanceTransaction.find({ userId: objId(userId), ...dateFilter(range) }).lean()) as FinanceTransactionDoc[]

  let receivedPaise = 0
  let spentPaise = 0
  let adjustmentsPaise = 0
  let expenseCount = 0
  let receivedCount = 0
  const walletAgg: Record<string, { spentPaise: number; receivedPaise: number }> = {}
  const categoryAgg = new Map<string, { spentPaise: number; count: number }>()
  const necessityAgg = { necessaryPaise: 0, optionalPaise: 0, wastefulPaise: 0, necessaryCount: 0, optionalCount: 0, wastefulCount: 0 }
  const daily = new Map<string, number>()
  let largest: { item: string; amountPaise: number; date: string } | null = null

  for (const t of txns) {
    const w = (walletAgg[t.walletKey] ??= { spentPaise: 0, receivedPaise: 0 })
    if (t.type === 'money_received') {
      receivedPaise += t.amountPaise
      receivedCount++
      w.receivedPaise += t.amountPaise
    } else if (t.type === 'expense') {
      const abs = Math.abs(t.amountPaise)
      spentPaise += abs
      expenseCount++
      w.spentPaise += abs
      const cat = t.categoryKey ?? 'other'
      const c = categoryAgg.get(cat) ?? { spentPaise: 0, count: 0 }
      c.spentPaise += abs
      c.count++
      categoryAgg.set(cat, c)
      const necKey = (t.necessity ?? 'necessary') as 'necessary' | 'optional' | 'wasteful'
      necessityAgg[`${necKey}Paise` as 'necessaryPaise' | 'optionalPaise' | 'wastefulPaise'] += abs
      necessityAgg[`${necKey}Count` as 'necessaryCount' | 'optionalCount' | 'wastefulCount']++
      daily.set(t.date, (daily.get(t.date) ?? 0) + abs)
      if (!largest || abs > largest.amountPaise) largest = { item: t.item ?? 'Expense', amountPaise: abs, date: t.date }
    } else if (t.type === 'balance_adjustment') {
      adjustmentsPaise += t.amountPaise
    }
  }

  const byCategory = [...categoryAgg.entries()]
    .map(([key, v]) => ({ key, label: categoryLabel(key), spentPaise: v.spentPaise, count: v.count }))
    .sort((a, b) => b.spentPaise - a.spentPaise)

  const foodCats = byCategory.filter((c) => categoryGroup(c.key) === 'food')

  // Money flow — opening balance brought forward, receipts, expenses,
  // adjustments, ending balance. Opening-balance transactions count into the
  // "opening" line wherever they fall; months never reset the ledger.
  let moneyFlow: AnalyticsResult['moneyFlow'] = null
  if (range.from && range.to) {
    const openingBefore = await sumBefore(userId, range.from)
    const openingTxnsInRange = txns
      .filter((t) => t.type === 'opening_balance')
      .reduce((s, t) => s + t.amountPaise, 0)
    const openingPaise = openingBefore + openingTxnsInRange
    const endingPaise = await sumThrough(userId, range.to)
    moneyFlow = {
      openingPaise,
      receivedPaise,
      availablePaise: openingPaise + receivedPaise,
      expensesPaise: spentPaise,
      adjustmentsPaise,
      endingPaise,
    }
  }

  let prevComparison: AnalyticsResult['prevComparison'] = null
  if (opts.withPrevComparison && range.from && range.to) {
    const prev = previousPeriod(range)
    const prevTxns = await FinanceTransaction.find({ userId: objId(userId), type: 'expense', ...dateFilter(prev) }).select('amountPaise').lean()
    const prevSpentPaise = prevTxns.reduce((s, t) => s + Math.abs((t as { amountPaise: number }).amountPaise), 0)
    prevComparison = {
      prevSpentPaise,
      changePct: prevSpentPaise > 0 ? Math.round(((spentPaise - prevSpentPaise) / prevSpentPaise) * 100) : null,
    }
  }

  return {
    from: range.from,
    to: range.to,
    totals: { receivedPaise, spentPaise, adjustmentsPaise, netFlowPaise: receivedPaise - spentPaise + adjustmentsPaise },
    byWallet: (['cash', 'phonepe'] as const).map((key) => ({
      key,
      label: walletLabel(key),
      spentPaise: walletAgg[key]?.spentPaise ?? 0,
      receivedPaise: walletAgg[key]?.receivedPaise ?? 0,
    })),
    byCategory,
    byNecessity: necessityAgg,
    food: {
      totalPaise: foodCats.reduce((s, c) => s + c.spentPaise, 0),
      count: foodCats.reduce((s, c) => s + c.count, 0),
      wastefulPaise: await computeFoodWasteful(userId, range),
      byCategory: foodCats,
    },
    dailySeries: [...daily.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, spentPaise]) => ({ date, spentPaise })),
    moneyFlow,
    largestExpense: largest,
    counts: { expenses: expenseCount, receivedTransactions: receivedCount },
    prevComparison,
  }
}

/** Wasteful spending restricted to food categories (for the food report). */
export async function computeFoodWasteful(userId: string, range: PeriodRange): Promise<number> {
  const rows = await FinanceTransaction.aggregate([
    { $match: { userId: objId(userId), type: 'expense', necessity: 'wasteful', ...dateFilter(range) } },
    { $group: { _id: '$categoryKey', total: { $sum: { $abs: '$amountPaise' } } } },
  ])
  let total = 0
  for (const row of rows) {
    if (row._id && categoryGroup(row._id as string) === 'food') total += row.total as number
  }
  return total
}

// ---------------------------------------------------------------------------
// Dad report — money received from a source (default "Dad"). Clearly separate
// from the current available balance (balances may carry over, include
// adjustments or other sources).
// ---------------------------------------------------------------------------

export interface DadReport {
  from: string | null
  to: string | null
  source: string
  totalPaise: number
  count: number
  averagePaise: number
  byWallet: { cashPaise: number; phonepePaise: number }
  transactions: { _id: string; date: string; amountPaise: number; walletKey: string; note?: string | null }[]
  currentBalanceDisclaimer: string
  currentBalancePaise: number
}

export async function computeDadReport(userId: string, range: PeriodRange, source: string, currentTotalPaise: number): Promise<DadReport> {
  const txns = (await FinanceTransaction.find({
    userId: objId(userId),
    type: 'money_received',
    source,
    ...dateFilter(range),
  })
    .sort({ date: 1, _id: 1 })
    .lean()) as FinanceTransactionDoc[]
  const totalPaise = txns.reduce((s, t) => s + t.amountPaise, 0)
  return {
    from: range.from,
    to: range.to,
    source,
    totalPaise,
    count: txns.length,
    averagePaise: txns.length > 0 ? Math.round(totalPaise / txns.length) : 0,
    byWallet: {
      cashPaise: txns.filter((t) => t.walletKey === 'cash').reduce((s, t) => s + t.amountPaise, 0),
      phonepePaise: txns.filter((t) => t.walletKey === 'phonepe').reduce((s, t) => s + t.amountPaise, 0),
    },
    transactions: txns.map((t) => ({
      _id: String(t._id),
      date: t.date,
      amountPaise: t.amountPaise,
      walletKey: t.walletKey,
      note: t.note,
    })),
    currentBalancePaise: currentTotalPaise,
    currentBalanceDisclaimer:
      'Money received is not the same as your current available balance — balances also carry over from earlier periods and include adjustments and other sources.',
  }
}
