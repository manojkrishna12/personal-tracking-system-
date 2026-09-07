import { PERIOD_OPTIONS, type PeriodName, type PeriodRange } from '../../lib/periods'
import { Select } from '../ui'

interface Props {
  period: PeriodName
  custom: { from: string; to: string }
  onPeriod: (p: PeriodName) => void
  onCustom: (c: { from: string; to: string }) => void
}

/** One consistent period control for every finance screen (plan §13A). */
export function PeriodSelector({ period, custom, onPeriod, onCustom }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onChange={(e) => onPeriod(e.target.value as PeriodName)} className="!w-40 !py-1.5">
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {period === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={custom.from}
            max={custom.to || undefined}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink"
            aria-label="From date"
          />
          <span className="text-xs text-muted">→</span>
          <input
            type="date"
            value={custom.to}
            min={custom.from || undefined}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink"
            aria-label="To date"
          />
        </div>
      )}
    </div>
  )
}

export function rangeLabel(period: PeriodName, range: PeriodRange): string {
  if (period === 'all') return 'All time'
  if (!range.from && !range.to) return 'All time'
  if (range.from === range.to) return range.from!
  return `${range.from ?? '…'} → ${range.to ?? '…'}`
}
