import { Link, useNavigate } from 'react-router-dom'
import { dayLabel } from '../../lib/dates'
import { IconButton } from '../ui'

/**
 * Back-to-dashboard control — always navigates to "/" (never history-back,
 * since the day page can be reached from several places). Compact label on
 * desktop; arrow-only on small screens with a full aria-label.
 */
function BackToDashboard() {
  return (
    <Link
      to="/"
      aria-label="Back to Dashboard"
      title="Back to Dashboard"
      className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 sm:px-3"
    >
      <span aria-hidden="true">←</span>
      <span className="hidden sm:inline">Dashboard</span>
    </Link>
  )
}

export default function DayNav({ date }: { date: string }) {
  const navigate = useNavigate()
  const d = new Date(`${date}T00:00:00`)
  const prev = new Date(d)
  prev.setDate(prev.getDate() - 1)
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="flex items-center gap-2">
        <BackToDashboard />
        <IconButton onClick={() => navigate(`/day/${fmt(prev)}`)} aria-label="Previous day">
          ‹
        </IconButton>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-ink">{dayLabel(date)}</div>
        <div className="text-xs text-muted">{date}</div>
      </div>
      <div className="flex justify-end">
        <IconButton onClick={() => navigate(`/day/${fmt(next)}`)} aria-label="Next day">
          ›
        </IconButton>
      </div>
    </div>
  )
}
