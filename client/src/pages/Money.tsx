import { useMemo, useState } from 'react'
import { Button, Card, ErrorState, LoadingState, SectionTitle } from '../components/ui'
import { MoneyOverview } from '../components/money/WalletCards'
import { AddMoneyModal } from '../components/money/AddMoneyModal'
import { AddExpenseModal } from '../components/money/AddExpenseModal'
import { ReconcileModal } from '../components/money/ReconcileModal'
import { OpeningBalanceEditor } from '../components/money/OpeningBalanceEditor'
import { PeriodSelector } from '../components/money/PeriodSelector'
import { TransactionList } from '../components/money/TransactionList'
import { useFinanceInsights, useFinanceOverview } from '../hooks/useFinance'
import { todayInTz } from '../lib/dates'
import { resolvePeriod, type PeriodName, type PeriodRange } from '../lib/periods'
import type { WalletKey } from '../api/types'

export default function Money() {
  const overview = useFinanceOverview()
  const settingsTz = overview.data?.today // server-anchored "today"
  const today = settingsTz ?? todayInTz()

  const [addMoney, setAddMoney] = useState(false)
  const [addExpense, setAddExpense] = useState(false)
  const [reconcile, setReconcile] = useState<WalletKey | null>(null)
  const [flash, setFlash] = useState('')

  // History period selection.
  const [period, setPeriod] = useState<PeriodName>('this_month')
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today })
  const range: PeriodRange = useMemo(
    () => (period === 'custom' ? { from: custom.from || null, to: custom.to || null } : resolvePeriod(period, today, 1)),
    [period, custom, today],
  )
  const rangeQ = useMemo(() => {
    const p = new URLSearchParams()
    if (range.from) p.set('from', range.from)
    if (range.to) p.set('to', range.to)
    const qs = p.toString()
    return qs ? `?${qs}` : ''
  }, [range])
  const insights = useFinanceInsights(rangeQ)

  if (overview.isLoading) return <LoadingState />
  if (overview.isError) return <ErrorState message="Could not load your money overview." onRetry={() => overview.refetch()} />

  const data = overview.data!
  const balances: Record<WalletKey, number> = { cash: 0, phonepe: 0 }
  const thresholds: Record<WalletKey, number> = { cash: 0, phonepe: 0 }
  for (const w of data.wallets) {
    balances[w.key] = w.balancePaise
    thresholds[w.key] = w.alertThresholdPaise
  }
  const needsSetup = data.wallets.every((w) => !w.hasOpeningBalance)
  const reconcileWallet = reconcile ? data.wallets.find((w) => w.key === reconcile) ?? null : null
  const csvHref = `/api/finance/export.csv${rangeQ}`

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">Money</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setAddMoney(true)}>
            + Add Money
          </Button>
          <Button onClick={() => setAddExpense(true)}>+ Add Expense</Button>
        </div>
      </div>

      {flash && <div className="rounded-md border border-line bg-surface px-4 py-2 text-xs text-muted">{flash}</div>}

      {needsSetup && <OpeningBalanceEditor />}

      <MoneyOverview
        overview={data}
        onAddMoney={() => setAddMoney(true)}
        onAddExpense={() => setAddExpense(true)}
        onReconcile={(w) => setReconcile(w.key)}
      />

      {insights.data && insights.data.messages.length > 0 && (
        <Card>
          <SectionTitle sub="Facts from your ledger — nothing invented">Insights</SectionTitle>
          <ul className="space-y-1.5 text-sm text-muted">
            {insights.data.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle sub="Every transfer and expense, permanent and editable">Transactions</SectionTitle>
          <PeriodSelector
            period={period}
            custom={custom}
            onPeriod={setPeriod}
            onCustom={(c) => setCustom({ from: c.from || today, to: c.to || today })}
          />
        </div>
        <TransactionList
          filters={{ from: range.from, to: range.to, limit: 100 }}
          balances={balances}
          emptyMessage="Start recording your money and expenses to see your financial insights."
        />
        <div className="mt-3 text-right">
          <a href={csvHref} className="text-xs text-muted underline hover:text-ink" download>
            Export this period as CSV
          </a>
        </div>
      </div>

      {addMoney && <AddMoneyModal date={today} onClose={() => setAddMoney(false)} onSaved={setFlash} />}
      {addExpense && (
        <AddExpenseModal
          date={today}
          balances={balances}
          thresholds={thresholds}
          onClose={() => setAddExpense(false)}
          onSaved={setFlash}
        />
      )}
      {reconcileWallet && (
        <ReconcileModal
          walletKey={reconcileWallet.key}
          walletLabel={reconcileWallet.label}
          balancePaise={reconcileWallet.balancePaise}
          date={today}
          onClose={() => setReconcile(null)}
        />
      )}
    </div>
  )
}
