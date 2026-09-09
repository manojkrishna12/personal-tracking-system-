import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MonthCalendar from '../components/calendar/MonthCalendar'
import { MaggieStreakCard, MonthCard, StreakCard, WeightGoalCard } from '../components/dashboard/SummaryCards'
import { ErrorState, IconButton, LoadingState } from '../components/ui'
import { MoneyOverview } from '../components/money/WalletCards'
import { AddMoneyModal } from '../components/money/AddMoneyModal'
import { AddExpenseModal } from '../components/money/AddExpenseModal'
import { OpeningBalanceEditor } from '../components/money/OpeningBalanceEditor'
import { ReconcileModal } from '../components/money/ReconcileModal'
import { useFinanceOverview } from '../hooks/useFinance'
import { useHabits, useMonthDays, useSettings, useStreaks, useWeight } from '../hooks/useApi'
import { currentMonth, monthLabel, todayInTz } from '../lib/dates'
import type { WalletKey } from '../api/types'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const tz = settings?.settings.timezone
  const today = useMemo(() => todayInTz(tz), [tz])
  const [month, setMonth] = useState(() => currentMonth(tz))

  const monthDays = useMonthDays(month)
  const streaks = useStreaks()
  const weight = useWeight(1)
  const habits = useHabits()
  const finance = useFinanceOverview()

  const [addMoney, setAddMoney] = useState(false)
  const [addExpense, setAddExpense] = useState(false)
  const [reconcile, setReconcile] = useState<WalletKey | null>(null)

  if (monthDays.isLoading || streaks.isLoading || weight.isLoading || habits.isLoading) return <LoadingState />
  if (monthDays.isError || streaks.isError || habits.isError) return <ErrorState message="Could not load your dashboard." onRetry={() => { monthDays.refetch(); streaks.refetch(); habits.refetch() }} />

  const habitLabels = Object.fromEntries(habits.data!.habits.map((h) => [h.key, h.label]))

  // Money section (plan §14) — compact, above the tracking cards. If the
  // overview is still loading it renders nothing (no layout shift risk).
  const financeData = finance.data
  const balances: Record<WalletKey, number> = { cash: 0, phonepe: 0 }
  const thresholds: Record<WalletKey, number> = { cash: 0, phonepe: 0 }
  if (financeData) {
    for (const w of financeData.wallets) {
      balances[w.key] = w.balancePaise
      thresholds[w.key] = w.alertThresholdPaise
    }
  }
  const reconcileWallet = financeData && reconcile ? financeData.wallets.find((w) => w.key === reconcile) ?? null : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Your day, at a glance</h1>
      </div>

      {financeData && (
        <section>
          {financeData.wallets.every((w) => !w.hasOpeningBalance) && <div className="mb-3"><OpeningBalanceEditor compact /></div>}
          <MoneyOverview
            overview={financeData}
            onAddMoney={() => setAddMoney(true)}
            onAddExpense={() => setAddExpense(true)}
            onReconcile={(w) => setReconcile(w.key)}
          />
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StreakCard streaks={streaks.data!} habitLabels={habitLabels} />
        <MaggieStreakCard streaks={streaks.data!} />
        <MonthCard month={month} days={monthDays.data!.days} today={today} />
        <div className="sm:col-span-2 lg:col-span-1">
          <WeightGoalCard entries={weight.data!.entries} settings={settings?.settings ?? { weightGoalKg: 85, weekStartsOn: 1, timezone: 'Asia/Kolkata', theme: 'light' }} />
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wider text-muted">{monthLabel(month)}</div>
          <div className="flex items-center gap-1.5">
            <IconButton onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">‹</IconButton>
            <IconButton onClick={() => setMonth((m) => (m === currentMonth(tz) ? m : currentMonth(tz)))}>Today</IconButton>
            <IconButton onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">›</IconButton>
          </div>
        </div>
        <MonthCalendar month={month} days={monthDays.data!.days} today={today} onSelect={(date) => navigate(`/day/${date}`)} />
      </div>

      {addMoney && <AddMoneyModal date={today} onClose={() => setAddMoney(false)} />}
      {addExpense && (
        <AddExpenseModal date={today} balances={balances} thresholds={thresholds} onClose={() => setAddExpense(false)} />
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