import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../ui'
import type { MonthDay, Streaks, WeightEntry, UserSettings } from '../../api/types'
import { formatKg, pluralDays } from '../../lib/format'
import { daysInMonthElapsed } from '../../lib/dates'

const MAGGIE_MILESTONES = new Set([3, 7, 14, 30, 60, 100])

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-ink">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  )
}

/**
 * Reverse-goal motivation card — Maggie: every explicit ✗ day extends the run.
 * Derived server-side from the daily records, so past edits recalculate it.
 * Motion is display-only: the value itself always comes from the API.
 */
export function MaggieStreakCard({ streaks }: { streaks: Streaks }) {
  const current = streaks.avoidHabits?.['maggie']?.current ?? 0
  const best = streaks.avoidHabits?.['maggie']?.best ?? 0
  // One-shot pop on every streak change; a stronger (still tasteful) flash at
  // milestones. `key` remounts the span so the CSS animation replays.
  const milestone = MAGGIE_MILESTONES.has(current)
  return (
    <div className="card-glass relative overflow-hidden rounded-2xl border border-warn/30 p-4 backdrop-blur-sm shadow-[0_0_36px_-10px_var(--glow-warm)] sm:p-5">
      {/* warm accent wash */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_160px_at_85%_0%,var(--warn-soft),transparent_70%)]" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warn">
            <span className="flame-breathe" aria-hidden="true">🔥</span> Maggie streak
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div
            key={current}
            className={`text-4xl font-bold tracking-tight text-ink ${milestone ? 'anim-milestone rounded-lg' : 'anim-pop'} inline-block`}
          >
            {current}
          </div>
          <div className="text-sm text-muted">{current === 1 ? 'day' : 'days'}</div>
        </div>
        <div className="mt-1 text-xs text-muted">
          {current === 0 ? 'Start your streak today — skip the Maggie.' : 'Keep going — every day counts.'}
        </div>
        {best > 0 && (
          <div className="mt-2 text-[11px] text-muted">Best: {pluralDays(best)} without Maggie</div>
        )}
      </div>
    </div>
  )
}

export function StreakCard({ streaks, habitLabels }: { streaks: Streaks; habitLabels: Record<string, string> }) {
  const rows: { key: string; label: string; value: number }[] = [
    { key: 'tracking', label: 'Tracked every day', value: streaks.tracking.current },
    { key: 'study', label: habitLabels['study'] ?? 'Study', value: streaks.habits['study']?.current ?? 0 },
    { key: 'gym', label: habitLabels['gym'] ?? 'Gym', value: streaks.habits['gym']?.current ?? 0 },
    { key: 'protein', label: habitLabels['protein'] ?? 'Protein', value: streaks.habits['protein']?.current ?? 0 },
  ]
  return (
    <Card interactive>
      <CardHeader title="Streaks" />
      <div className="grid grid-cols-2 gap-2.5">
        {rows.map((r) => (
          <div key={`${r.key}-${r.value}`} className="rounded-xl border border-line bg-surface-2/40 px-3 py-2">
            <div key={r.value} className="anim-pop text-lg font-semibold text-ink">
              {r.value} <span className="text-xs font-normal text-muted">days</span>
            </div>
            <div className="truncate text-[11px] text-muted">{r.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-muted">
        Best tracking streak: {pluralDays(streaks.tracking.best)}
      </div>
    </Card>
  )
}

export function MonthCard({ month, days, today }: { month: string; days: MonthDay[]; today: string }) {
  const tracked = days.filter((d) => d.score != null)
  const excellent = tracked.filter((d) => d.quality === 'excellent').length
  const average = tracked.filter((d) => d.quality === 'average').length
  const poor = tracked.filter((d) => d.quality === 'poor').length
  const elapsed = daysInMonthElapsed(month, today)
  const consistency = elapsed > 0 ? Math.round((tracked.length / elapsed) * 100) : 0

  return (
    <Card interactive>
      <CardHeader title="This month" />
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-ink">{tracked.length}/{elapsed}</span>
          <span className="text-xs text-muted">tracked · {consistency}% consistency</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-gradient-to-r from-[var(--good)] to-[var(--accent-2)] transition-[width] duration-700" style={{ width: `${consistency}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-good/10 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold text-good">{excellent}</div>
          <div className="text-[10px] text-muted">Excellent</div>
        </div>
        <div className="rounded-xl bg-warn/10 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold text-warn">{average}</div>
          <div className="text-[10px] text-muted">Average</div>
        </div>
        <div className="rounded-xl bg-bad/10 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold text-bad">{poor}</div>
          <div className="text-[10px] text-muted">Poor</div>
        </div>
      </div>
    </Card>
  )
}

export function WeightGoalCard({ entries, settings }: { entries: WeightEntry[]; settings: UserSettings }) {
  const latest = entries[0] ?? null
  const goal = settings.weightGoalKg
  const remaining = latest ? Math.max(0, latest.weightKg - goal) : null
  const progress = latest && latest.weightKg > goal && entries.length >= 2 ? Math.max(0, Math.min(100, Math.round(((entries[entries.length - 1]!.weightKg - latest.weightKg) / (entries[entries.length - 1]!.weightKg - goal)) * 100))) : null

  return (
    <Card interactive>
      <CardHeader
        title="Weight"
        action={
          <Link to="/weight" className="text-xs text-accent hover:underline">
            Manage →
          </Link>
        }
      />
      {latest ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink">{formatKg(latest.weightKg)}</span>
            <span className="text-xs text-muted">goal {formatKg(goal)}</span>
          </div>
          {progress != null ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--good)] to-[var(--accent-2)] transition-[width] duration-700" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>{progress}% to goal</span>
                <span>{remaining != null ? `${formatKg(remaining)} left` : ''}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted">Keep recording measurements to see progress.</div>
          )}
        </>
      ) : (
        <div className="py-1 text-sm text-muted">No weight recorded yet.</div>
      )}
    </Card>
  )
}
