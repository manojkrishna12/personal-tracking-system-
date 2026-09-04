import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MonthCalendar from '../components/calendar/MonthCalendar'
import { MonthCard, StreakCard, WeightGoalCard } from '../components/dashboard/SummaryCards'
import { ErrorState, IconButton, LoadingState } from '../components/ui'
import { useHabits, useMonthDays, useSettings, useStreaks, useWeight } from '../hooks/useApi'
import { currentMonth, monthLabel, todayInTz } from '../lib/dates'

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

  if (monthDays.isLoading || streaks.isLoading || weight.isLoading || habits.isLoading) return <LoadingState />
  if (monthDays.isError || streaks.isError || habits.isError) return <ErrorState message="Could not load your dashboard." onRetry={() => { monthDays.refetch(); streaks.refetch(); habits.refetch() }} />

  const habitLabels = Object.fromEntries(habits.data!.habits.map((h) => [h.key, h.label]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Your day, at a glance</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StreakCard streaks={streaks.data!} habitLabels={habitLabels} />
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
    </div>
  )
}