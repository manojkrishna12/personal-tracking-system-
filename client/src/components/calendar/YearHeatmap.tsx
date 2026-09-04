import { startOfWeek, getDay, parseISO } from 'date-fns'
import { fmtDate, yearDays } from '../../lib/dates'
import { qualityColor } from '../../lib/quality'

interface Props {
  year: string
  heatmap: { date: string; quality: 'excellent' | 'average' | 'poor' | null }[]
}

export default function YearHeatmap({ year, heatmap }: Props) {
  const byDate = new Map(heatmap.map((h) => [h.date, h.quality]))
  const days = yearDays(year)

  // Column per week (Monday-first); row = weekday.
  const weekIndex = new Map<string, number>()
  let cols = 0
  for (const date of days) {
    const ws = fmtDate(startOfWeek(parseISO(date), { weekStartsOn: 1 }))
    if (!weekIndex.has(ws)) {
      weekIndex.set(ws, cols)
      cols++
    }
  }

  const grid: (string | null)[][] = Array.from({ length: cols }, () => Array(7).fill(null))
  for (const date of days) {
    const ws = fmtDate(startOfWeek(parseISO(date), { weekStartsOn: 1 }))
    const col = weekIndex.get(ws)!
    const row = (getDay(parseISO(date)) + 6) % 7 // Monday = 0
    grid[col]![row] = date
  }

  // Month labels at the top of the column where each month starts.
  const monthCols: { label: string; col: number }[] = []
  let lastMonth = ''
  for (const date of days) {
    const m = date.slice(0, 7)
    if (m !== lastMonth) {
      const ws = fmtDate(startOfWeek(parseISO(date), { weekStartsOn: 1 }))
      monthCols.push({ label: date.slice(5, 7), col: weekIndex.get(ws)! })
      lastMonth = m
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-max">
        <div className="mb-1 flex gap-[3px]">
          {Array.from({ length: cols }, (_, c) => {
            const m = monthCols.find((x) => x.col === c)
            return (
              <div key={c} className="w-[13px] text-[9px] text-muted">
                {m ? m.label : ''}
              </div>
            )
          })}
        </div>
        <div className="flex gap-[3px]">
          {grid.map((column, c) => (
            <div key={c} className="flex flex-col gap-[3px]">
              {column.map((date, r) => {
                const quality = date ? byDate.get(date) ?? null : null
                return (
                  <div
                    key={r}
                    title={date ?? ''}
                    className="h-[13px] w-[13px] rounded-[2px]"
                    style={{ background: date ? qualityColor(quality) : 'transparent' }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
          <span>Less</span>
          <span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: 'var(--bad)' }} />
          <span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: 'var(--warn)' }} />
          <span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: 'var(--good)' }} />
          <span>More</span>
          <span className="ml-auto">Hover a cell for its date</span>
        </div>
      </div>
    </div>
  )
}