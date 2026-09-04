import { useState } from 'react'
import { Card, EmptyState, ErrorState, IconButton, LoadingState, SectionTitle } from '../components/ui'
import { useHabits, useWeeklyInsights } from '../hooks/useApi'
import { addDaysStr, dayLabel, todayInTz, weekBounds } from '../lib/dates'
import { pluralDays } from '../lib/format'

export default function Weekly() {
  const [anchor, setAnchor] = useState(() => todayInTz())
  const { start, end } = weekBounds(anchor, 1)
  const insights = useWeeklyInsights(start)
  const habits = useHabits()

  if (insights.isLoading || habits.isLoading) return <LoadingState />
  if (insights.isError || habits.isError) return <ErrorState message="Could not load weekly insights." />

  const data = insights.data!
  const defs = [...habits.data!.habits].sort((a, b) => a.order - b.order)
  const goalDefs = defs.filter((d) => d.weeklyGoal.min != null || d.weeklyGoal.max != null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">This Week</h1>
        <div className="flex items-center gap-1.5">
          <IconButton onClick={() => setAnchor((a) => addDaysStr(a, -7))} aria-label="Previous week">‹</IconButton>
          <IconButton onClick={() => setAnchor(todayInTz())}>This week</IconButton>
          <IconButton onClick={() => setAnchor((a) => addDaysStr(a, 7))} aria-label="Next week">›</IconButton>
        </div>
      </div>

      <p className="text-sm text-muted">
        {dayLabel(start)} – {dayLabel(end)}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <SectionTitle>Overview</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Days tracked</div>
              <div className="mt-0.5 text-xl font-semibold text-ink">{data.trackedDays} / 7</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Average score</div>
              <div className="mt-0.5 text-xl font-semibold text-ink">{data.averageScore ?? '—'} <span className="text-sm font-normal text-muted">/ 100</span></div>
            </div>
          </div>
          {data.prevWeekAverageScore != null && (
            <div className="mt-3 text-xs text-muted">Last week's average: {data.prevWeekAverageScore}</div>
          )}
        </Card>

        <Card>
          <SectionTitle>Habit counts</SectionTitle>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {defs
              .filter((d) => d.key !== 'thingsBought')
              .map((d) => (
                <div key={d.key} className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">{d.label}</span>
                  <span className="font-medium text-ink">{data.counts[d.key] ?? 0} <span className="text-xs font-normal text-muted">/ 7</span></span>
                </div>
              ))}
          </div>
        </Card>
      </div>

      {goalDefs.length > 0 && (
        <Card>
          <SectionTitle sub="Compared with your weekly targets">Weekly goals</SectionTitle>
          <ul className="space-y-1.5">
            {data.goalMessages.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted/50" />
                {m}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle sub="Rule-based suggestion from this week's data">Next week's focus</SectionTitle>
        {data.focusMessages.length === 0 ? (
          <EmptyState message="No data to suggest a focus yet." />
        ) : (
          <ul className="space-y-1.5">
            {data.focusMessages.map((m, i) => (
              <li key={i} className="text-sm text-ink">{m}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>Observations</SectionTitle>
        {data.observations.length === 0 ? (
          <EmptyState message="No observations yet — track your days to see patterns." />
        ) : (
          <ul className="space-y-2">
            {data.observations.map((o, i) => (
              <li key={i} className="text-sm leading-relaxed text-ink">{o}</li>
            ))}
          </ul>
        )}
        {data.trackedDays === 0 && (
          <p className="mt-2 text-xs text-muted">You haven't tracked any days in this week ({pluralDays(data.trackedDays)}).</p>
        )}
      </Card>
    </div>
  )
}