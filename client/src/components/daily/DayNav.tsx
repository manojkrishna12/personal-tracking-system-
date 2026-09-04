import { useNavigate } from 'react-router-dom'
import { dayLabel } from '../../lib/dates'
import { IconButton } from '../ui'

export default function DayNav({ date }: { date: string }) {
  const navigate = useNavigate()
  const d = new Date(`${date}T00:00:00`)
  const prev = new Date(d)
  prev.setDate(prev.getDate() - 1)
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

  return (
    <div className="flex items-center justify-between">
      <IconButton onClick={() => navigate(`/day/${fmt(prev)}`)} aria-label="Previous day">
        ‹
      </IconButton>
      <div className="text-center">
        <div className="text-sm font-semibold text-ink">{dayLabel(date)}</div>
        <div className="text-xs text-muted">{date}</div>
      </div>
      <IconButton onClick={() => navigate(`/day/${fmt(next)}`)} aria-label="Next day">
        ›
      </IconButton>
    </div>
  )
}