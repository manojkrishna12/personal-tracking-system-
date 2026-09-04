import { useMemo, useState } from 'react'
import { HabitConsistencyChart, PositiveVsNegative, ProgressBar, PurchaseSummaryCard, ScoreTrendChart } from '../components/analytics/charts'
import { Card, EmptyState, ErrorState, IconButton, LoadingState, SectionTitle } from '../components/ui'
import { useHabits, useMonthlyInsights } from '../hooks/useApi'
import { currentMonth, daysInMonthElapsed, monthLabel, todayInTz } from '../lib/dates'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Monthly() {
  const [month, setMonth] = useState(() => currentMonth())
  const insights = useMonthlyInsights(month)
  const habits = useHabits()

  const habitBars = useMemo(() => {
    if (!insights.data || !habits.data) return []
    return [...habits.data.habits]
      .filter((h) => h.key !== 'thingsBought')
      .sort((a, b) => (insights.data!.counts[b.key] ?? 0) - (insights.data!.counts[a.key] ?? 0))
      .map((h) => ({ label: h.label, count: insights.data!.counts[h.key] ?? 0 }))
  }, [insights.data, habits.data])

  if (insights.isLoading || habits.isLoading) return <LoadingState />
  if (insights.isError || habits.isError) return <ErrorState message="Could not load monthly analytics." />

  const data = insights.data!
  const elapsed = Math.max(daysInMonthElapsed(month, todayInTz()), 1)
  const progress = (key: string) => ({ count: data.counts[key] ?? 0, of: elapsed })
  const gymP = progress('gym')
  const studyP = progress('study')
  const proteinP = progress('protein')
  const negativeTotal = (data.counts['junkFood'] ?? 0) + (data.counts['eatOutside'] ?? 0) + (data.counts['maggie'] ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{monthLabel(month)}</h1>
        <div className="flex items-center gap-1.5">
          <IconButton onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">‹</IconButton>
          <IconButton onClick={() => setMonth(currentMonth())}>This month</IconButton>
          <IconButton onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">›</IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['excellent', 'average', 'poor'] as const).map((q) => (
          <Card key={q} className="!p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted capitalize">{q}</div>
            <div className="mt-1 text-xl font-semibold text-ink">{data.qualityCounts[q]}</div>
          </Card>
        ))}
        <Card className="!p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">Days tracked</div>
          <div className="mt-1 text-xl font-semibold text-ink">{data.trackedDays}</div>
        </Card>
      </div>

      <ScoreTrendChart data={data.scoreSeries} />

      <div className="grid gap-4 sm:grid-cols-2">
        <HabitConsistencyChart data={habitBars} />
        <PositiveVsNegative positive={data.positiveCompleted} negative={data.negativeCompleted} />
      </div>

      <Card>
        <SectionTitle sub="Compared with days elapsed this month">Key habits</SectionTitle>
        <div className="space-y-3">
          <ProgressBar label="Gym" count={gymP.count} of={gymP.of} />
          <ProgressBar label="Study" count={studyP.count} of={studyP.of} />
          <ProgressBar label="Protein" count={proteinP.count} of={proteinP.of} />
        </div>
      </Card>

      <Card>
        <SectionTitle sub="How often negative habits occurred">Frequency</SectionTitle>
        {negativeTotal === 0 ? (
          <EmptyState message="No negative habits recorded this month — great." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {['junkFood', 'eatOutside', 'maggie'].map((key) => (
              <div key={key} className="rounded-md bg-surface-2 px-3 py-2 text-center">
                <div className="text-lg font-semibold text-ink">{data.counts[key] ?? 0}</div>
                <div className="text-[11px] text-muted">
                  {key === 'junkFood' ? 'Junk food' : key === 'eatOutside' ? 'Eat outside' : 'Maggie'} days
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PurchaseSummaryCard purchases={data.purchases} month={month} />
    </div>
  )
}