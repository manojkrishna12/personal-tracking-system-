import { Link } from 'react-router-dom'
import { Card } from '../ui'
import type { MonthDay, Streaks, WeightEntry, UserSettings } from '../../api/types'
import { formatKg, pluralDays } from '../../lib/format'
import { daysInMonthElapsed } from '../../lib/dates'

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-ink">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  )
}

export function StreakCard({ streaks, habitLabels }: { streaks: Streaks; habitLabels: Record<string, string> }) {
  const rows: { key: string; label: string; value: number }[] = [
    { key: 'tracking', label: 'Tracked every day', value: streaks.tracking.current },
    { key: 'study', label: 'Study', value: streaks.habits['study']?.current ?? 0 },
    { key: 'gym', label: 'Gym', value: streaks.habits['gym']?.current ?? 0 },
    { key: 'protein', label: 'Protein', value: streaks.habits['protein']?.current ?? 0 },
  ]
  return (
    <Card>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Streaks</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.key} className="rounded-md bg-surface-2 px-3 py-2">
            <div className="text-lg font-semibold text-ink">
              {r.value} <span className="text-xs font-normal text-muted">days</span>
            </div>
            <div className="text-[11px] text-muted">{r.label}</div>
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
    <Card>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">This month</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Tracked" value={`${tracked.length}/${elapsed}`} sub={`${consistency}% consistency`} />
        <Stat label="Excellent" value={excellent} />
        <Stat label="Average" value={average} />
        <Stat label="Poor" value={poor} />
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
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Weight</div>
        <Link to="/weight" className="text-xs text-muted hover:text-ink">
          Manage →
        </Link>
      </div>
      {latest ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Current" value={formatKg(latest.weightKg)} />
            <Stat label="Goal" value={formatKg(goal)} />
            <Stat label="Remaining" value={remaining != null ? formatKg(remaining) : '—'} />
          </div>
          {progress != null ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-good" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted">{progress}% of the way to your goal</div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted">Keep recording measurements to see progress.</div>
          )}
        </>
      ) : (
        <div className="mt-3 text-sm text-muted">No weight recorded yet.</div>
      )}
    </Card>
  )
}