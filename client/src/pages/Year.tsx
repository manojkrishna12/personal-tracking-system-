import { useState } from 'react'
import YearHeatmap from '../components/calendar/YearHeatmap'
import { Card, EmptyState, ErrorState, IconButton, LoadingState, SectionTitle } from '../components/ui'
import { useYearReview } from '../hooks/useApi'
import { currentYear } from '../lib/dates'
import { formatINR, formatKg, pluralDays } from '../lib/format'

export default function Year() {
  const [year, setYear] = useState(() => currentYear())
  const review = useYearReview(year)

  if (review.isLoading) return <LoadingState />
  if (review.isError) return <ErrorState message="Could not load the year review." />

  const data = review.data!

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{data.year} in review</h1>
        <div className="flex items-center gap-1.5">
          <IconButton onClick={() => setYear((y) => String(Number(y) - 1))} aria-label="Previous year">‹</IconButton>
          <IconButton onClick={() => setYear(currentYear())}>This year</IconButton>
          <IconButton onClick={() => setYear((y) => String(Number(y) + 1))} aria-label="Next year">›</IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Days tracked" value={data.trackedDays} />
        <StatCard label="Excellent" value={data.qualityCounts.excellent} />
        <StatCard label="Average" value={data.qualityCounts.average} />
        <StatCard label="Poor" value={data.qualityCounts.poor} />
        <StatCard label="Gym days" value={data.counts['gym'] ?? 0} />
        <StatCard label="Study days" value={data.counts['study'] ?? 0} />
        <StatCard label="Junk food days" value={data.counts['junkFood'] ?? 0} />
        <StatCard label="Total spent" value={formatINR(data.totalPurchaseAmount)} />
      </div>

      <Card>
        <SectionTitle sub="Every day of the year">Activity</SectionTitle>
        {data.trackedDays === 0 ? (
          <EmptyState message="Nothing tracked this year yet." />
        ) : (
          <YearHeatmap year={data.year} heatmap={data.heatmap} />
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <SectionTitle>Streaks</SectionTitle>
          <div className="space-y-2 text-sm">
            <Row label="Best tracking streak" value={pluralDays(data.bestStreaks.tracking)} />
            <Row label="Best gym streak" value={pluralDays(data.bestStreaks.habits['gym'] ?? 0)} />
            <Row label="Best study streak" value={pluralDays(data.bestStreaks.habits['study'] ?? 0)} />
            <Row label="Best protein streak" value={pluralDays(data.bestStreaks.habits['protein'] ?? 0)} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Habit highlights</SectionTitle>
          {data.mostConsistentHabit ? (
            <div className="space-y-2 text-sm">
              <Row label="Most consistent habit" value={`${data.mostConsistentHabit.label} · ${pluralDays(data.mostConsistentHabit.count)}`} />
              {data.needsImprovementHabit ? (
                <Row label="Habit needing improvement" value={`${data.needsImprovementHabit.label} · ${pluralDays(data.needsImprovementHabit.count)}`} />
              ) : null}
            </div>
          ) : (
            <EmptyState message="Track some positive habits to see highlights." />
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Weight progress</SectionTitle>
        {data.weight.startKg != null && data.weight.currentKg != null ? (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Start</div>
              <div className="mt-0.5 text-lg font-semibold text-ink">{formatKg(data.weight.startKg)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">End</div>
              <div className="mt-0.5 text-lg font-semibold text-ink">{formatKg(data.weight.currentKg)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Change</div>
              <div className={`mt-0.5 text-lg font-semibold ${data.weight.currentKg < data.weight.startKg ? 'text-good' : 'text-warn'}`}>
                {data.weight.currentKg - data.weight.startKg >= 0 ? '+' : ''}
                {(data.weight.currentKg - data.weight.startKg).toFixed(1)} kg
              </div>
            </div>
          </div>
        ) : (
          <EmptyState message="No weight entries this year." />
        )}
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="!p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  )
}