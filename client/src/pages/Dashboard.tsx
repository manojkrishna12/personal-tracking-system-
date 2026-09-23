import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MonthCalendar from '../components/calendar/MonthCalendar'
import { MaggieStreakCard, MonthCard, StreakCard, WeightGoalCard } from '../components/dashboard/SummaryCards'
import { TodayHabitsCard, TodayProgressCard } from '../components/dashboard/TodayProgress'
import { ErrorState, IconButton, LoadingState } from '../components/ui'
import { MoneyOverview } from '../components/money/WalletCards'
import { AddMoneyModal } from '../components/money/AddMoneyModal'
import { AddExpenseModal } from '../components/money/AddExpenseModal'
import { OpeningBalanceEditor } from '../components/money/OpeningBalanceEditor'
import { ReconcileModal } from '../components/money/ReconcileModal'
import { useFinanceOverview } from '../hooks/useFinance'
import { useHabits, useMe, useMonthDays, useSettings, useStreaks, useWeight } from '../hooks/useApi'
import { currentMonth, monthLabel, todayInTz } from '../lib/dates'
import type { WalletKey } from '../api/types'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const QUOTES = [
  'Small consistent steps create big results.',
  'Discipline today, a better tomorrow.',
  'A little progress each day adds up to big results.',
  'Track your today. Build your tomorrow.',
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const { data: me } = useMe()
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

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz || 'Asia/Kolkata' }).format(new Date()))
  const quote = QUOTES[Number(today.slice(8, 10)) % QUOTES.length]!
  const firstName = (me?.user.name ?? 'there').split(' ')[0]!

  return (
    <div className="stagger space-y-6">
      {/* Greeting header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{today}</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {greeting(hour)}, <span className="text-gradient">{firstName}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-muted">“{quote}”</p>
        </div>
      </header>

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
        <TodayProgressCard today={today} tz={tz ?? 'Asia/Kolkata'} />
        <MaggieStreakCard streaks={streaks.data!} />
        <MonthCard month={month} days={monthDays.data!.days} today={today} />
        <TodayHabitsCard today={today} />
        <StreakCard streaks={streaks.data!} habitLabels={habitLabels} />
        <div className="sm:col-span-2 lg:col-span-1">
          <WeightGoalCard entries={weight.data!.entries} settings={settings?.settings ?? { weightGoalKg: 85, weekStartsOn: 1, timezone: 'Asia/Kolkata', theme: 'light' }} />
        </div>
      </div>

      <div className="card-glass rounded-2xl border border-line p-4 backdrop-blur-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{monthLabel(month)}</div>
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
