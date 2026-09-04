import { monthDayGrid, monthLabel, weekdayHeader } from '../../lib/dates'
import { qualityColor } from '../../lib/quality'
import type { MonthDay } from '../../api/types'

interface Props {
  month: string
  days: MonthDay[]
  today: string
  onSelect: (date: string) => void
}

export default function MonthCalendar({ month, days, today, onSelect }: Props) {
  const cells = monthDayGrid(month, 1)
  const byDate = new Map(days.map((d) => [d.date, d]))
  const isCurrentMonth = (d: string) => d.slice(0, 7) === month

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {weekdayHeader(1).map((d) => (
          <div key={d} className="pb-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted">
            {d}
          </div>
        ))}
        {cells.map((date) => {
          const day = byDate.get(date)
          const isToday = date === today
          const isFuture = date > today
          const inMonth = isCurrentMonth(date)
          return (
            <button
              key={date}
              disabled={isFuture}
              onClick={() => onSelect(date)}
              title={day ? `${date} · ${day.score ?? ''}` : date}
              className={`group relative flex aspect-square flex-col items-center justify-center rounded-md text-sm transition-colors ${
                isFuture ? 'cursor-default text-muted/35' : inMonth ? 'text-ink hover:bg-surface-2' : 'text-muted/45 hover:bg-surface-2'
              } ${isToday ? 'ring-1 ring-inset ring-muted' : ''}`}
            >
              <span className={isToday ? 'font-semibold' : ''}>{Number(date.slice(8, 10))}</span>
              <span
                className="mt-0.5 h-1.5 w-1.5 rounded-full"
                style={{
                  background: day ? qualityColor(day.quality) : 'transparent',
                }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
        <span className="text-sm font-medium text-ink">{monthLabel(month)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--good)' }} /> Excellent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warn)' }} /> Average
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--bad)' }} /> Poor
        </span>
      </div>
    </div>
  )
}