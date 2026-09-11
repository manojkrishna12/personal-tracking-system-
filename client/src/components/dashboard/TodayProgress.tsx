import { Link } from 'react-router-dom'
import { Card, CardHeader, ProgressRing } from '../ui'
import { useDay, useHabits, useScoringConfig } from '../../hooks/useApi'
import type { HabitEntry } from '../../api/types'

/**
 * Today's Progress — animated completion ring over the *actually recorded*
 * boolean habits for today (purchase-type "Things Bought" is excluded; it has
 * its own flow). All values come from the existing day/habits APIs.
 */
export function TodayProgressCard({ today, tz }: { today: string; tz: string }) {
  const day = useDay(today)
  const habits = useHabits()

  const booleanHabits = (habits.data?.habits ?? []).filter((h) => h.type === 'boolean')
  const entries: HabitEntry[] = day.data?.habits ?? []
  const entryFor = (key: string) => entries.find((e) => e.habitKey === key)
  const recorded = booleanHabits.filter((h) => entryFor(h.key) != null)
  const completed = recorded.filter((h) => entryFor(h.key)?.status === 'completed')
  const pct = recorded.length > 0 ? Math.round((completed.length / recorded.length) * 100) : 0

  return (
    <Card interactive className="flex items-center gap-4">
      <ProgressRing value={pct} size={76} label="done" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Today's progress</div>
        <div className="mt-0.5 text-lg font-semibold text-ink">
          {completed.length}/{recorded.length || booleanHabits.length} habits
        </div>
        <div className="text-xs text-muted">
          {recorded.length === 0 ? 'Nothing recorded yet today.' : completed.length === recorded.length ? 'All recorded habits done — great day!' : 'Keep going!'}
        </div>
        <Link to={`/day/${today}`} className="mt-1 inline-block text-xs text-accent hover:underline">
          Open today →
        </Link>
      </div>
      <span className="sr-only">{`Timezone ${tz}`}</span>
    </Card>
  )
}

/**
 * Today's Habits — compact status chips for each boolean habit, straight from
 * the day record. Read-only overview; tapping opens the full day view.
 */
export function TodayHabitsCard({ today }: { today: string }) {
  const day = useDay(today)
  const habits = useHabits()
  const scoring = useScoringConfig()
  // Reverse-goal habits (direction 'negative', e.g. Maggie): ✗ is the success
  // state, so it reads as positive here. Purely visual — no logic change.
  const negativeKeys = new Set((scoring.data?.habits ?? []).filter((h) => h.direction === 'negative').map((h) => h.habitKey))

  const booleanHabits = (habits.data?.habits ?? []).filter((h) => h.type === 'boolean')
  const entries: HabitEntry[] = day.data?.habits ?? []
  const entryFor = (key: string) => entries.find((e) => e.habitKey === key)

  return (
    <Card>
      <CardHeader
        title="Today's habits"
        action={
          <Link to={`/day/${today}`} className="text-xs text-accent hover:underline">
            View all →
          </Link>
        }
      />
      {booleanHabits.length === 0 ? (
        <div className="py-2 text-sm text-muted">No habits configured.</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {booleanHabits.map((h) => {
            const entry = entryFor(h.key)
            const isNegative = negativeKeys.has(h.key)
            // done = visually positive state; for avoid-habits that's an explicit ✗
            const positive = entry != null && (isNegative ? entry.status === 'not_completed' : entry.status === 'completed')
            const recorded = entry != null
            const mark = entry?.status === 'completed' ? '✓' : entry?.status === 'not_completed' ? '✗' : '·'
            const detail = entry?.details ?? entry?.reason ?? ''
            return (
              <Link
                key={h.key}
                to={`/day/${today}`}
                className={`rounded-xl border px-2.5 py-2 transition-colors ${
                  positive
                    ? 'border-good/30 bg-good/10'
                    : recorded
                      ? 'border-bad/25 bg-bad/10'
                      : 'border-line bg-surface-2/40'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      positive ? 'bg-good text-bg' : recorded ? 'bg-bad/80 text-white' : 'border border-muted/50 text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {mark}
                  </span>
                  <span className="truncate text-xs font-medium text-ink">{h.label}</span>
                </div>
                {entry == null ? (
                  <div className="mt-0.5 text-[10px] text-muted">Not recorded</div>
                ) : detail ? (
                  <div className="mt-0.5 truncate text-[10px] text-muted">{detail}</div>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </Card>
  )
}
