import { walletBalances, sumExpenses } from './ledger'
import { walletLabel } from './registry'
import { formatPaise } from './money'
import type { PeriodRange } from './periods'

// Deterministic, rule-based financial insights (plan §17). Every message is
// derived from actual ledger data; insights are suppressed when the data is
// insufficient — nothing is ever invented.

export interface FinanceInsightsResult {
  periodLabel: string
  messages: string[]
  flags: { lowBalance: { walletKey: 'cash' | 'phonepe'; label: string; balancePaise: number; thresholdPaise: number }[] }
}

const PERIOD_LABELS: Record<string, string> = {
  today: 'today',
  this_week: 'this week',
  last_week: 'last week',
  this_month: 'this month',
  last_month: 'last month',
  this_year: 'this year',
  custom: 'this period',
  all: 'all time',
}

export async function computeFinanceInsights(
  userId: string,
  period: string,
  range: PeriodRange,
  analytics: {
    totals: { receivedPaise: number; spentPaise: number; adjustmentsPaise: number }
    byCategory: { key: string; label: string; spentPaise: number; count: number }[]
    byWallet: { key: string; label: string; spentPaise: number; receivedPaise: number }[]
    counts: { expenses: number; receivedTransactions: number }
    byNecessity: { wastefulPaise: number }
    prevComparison: { prevSpentPaise: number; changePct: number | null } | null
  },
  settings: { alertThresholdPaise: { cash: number; phonepe: number } },
  opening: Record<'cash' | 'phonepe', boolean>,
): Promise<FinanceInsightsResult> {
  const periodLabel = PERIOD_LABELS[period] ?? 'this period'
  const messages: string[] = []
  const flags: FinanceInsightsResult['flags'] = { lowBalance: [] }

  // Low-balance warnings — only for wallets the user actually set up, so a
  // brand-new account is never warned about a wallet it does not use.
  const balances = await walletBalances(userId)
  for (const key of ['cash', 'phonepe'] as const) {
    const threshold = settings.alertThresholdPaise?.[key] ?? 0
    if (threshold > 0 && opening[key] && balances[key] < threshold) {
      flags.lowBalance.push({ walletKey: key, label: walletLabel(key), balancePaise: balances[key], thresholdPaise: threshold })
      messages.push(`${walletLabel(key)} balance is low — ${formatPaise(balances[key])} remaining.`)
    }
  }

  const noData = analytics.counts.expenses === 0 && analytics.counts.receivedTransactions === 0
  if (noData) {
    if (messages.length === 0) messages.push('No money recorded for this period yet.')
    return { periodLabel, messages, flags }
  }

  // Highest spending category.
  const top = analytics.byCategory[0]
  if (top) {
    messages.push(`${top.label} is your highest spending category ${periodLabel} (${formatPaise(top.spentPaise)}).`)
  }

  // Wasteful spending.
  if (analytics.byNecessity.wastefulPaise > 0) {
    messages.push(`You spent ${formatPaise(analytics.byNecessity.wastefulPaise)} on wasteful purchases ${periodLabel}.`)
  }

  // Week-over-week / period-over-period comparison — only with real data.
  if (analytics.prevComparison && analytics.prevComparison.changePct != null && analytics.prevComparison.prevSpentPaise > 0) {
    const pct = analytics.prevComparison.changePct
    if (pct > 0) messages.push(`Your spending increased ${pct}% compared with the previous period.`)
    else if (pct < 0) messages.push(`Your spending decreased ${Math.abs(pct)}% compared with the previous period.`)
    else messages.push('Your spending matched the previous period.')
  }

  // Wallet comparison.
  const cash = analytics.byWallet.find((w) => w.key === 'cash')
  const phonepe = analytics.byWallet.find((w) => w.key === 'phonepe')
  if (cash && phonepe && cash.spentPaise > 0 && phonepe.spentPaise > 0 && cash.spentPaise !== phonepe.spentPaise) {
    const bigger = cash.spentPaise > phonepe.spentPaise ? cash.label : phonepe.label
    messages.push(`You spent more through ${bigger} than ${bigger === cash.label ? phonepe.label : cash.label} ${periodLabel}.`)
  }

  // Money received.
  if (analytics.counts.receivedTransactions > 0) {
    messages.push(`You received money ${analytics.counts.receivedTransactions} time${analytics.counts.receivedTransactions === 1 ? '' : 's'} ${periodLabel} (${formatPaise(analytics.totals.receivedPaise)}).`)
  }

  return { periodLabel, messages, flags }
}

// Re-exported so routes can compute thresholds without importing ledger twice.
export { sumExpenses }
