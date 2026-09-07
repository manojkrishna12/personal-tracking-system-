// Client mirror of server/src/finance/periods.ts — identical period bounds.
// Parity is covered by tests mirroring the server's period unit tests.

export type PeriodName =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom'
  | 'all'

export interface PeriodRange {
  from: string | null
  to: string | null
}

export const PERIOD_OPTIONS: { value: PeriodName; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
  { value: 'all', label: 'All Time' },
]

function addDaysStr(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekBounds(date: string, weekStartsOn: 0 | 1): PeriodRange {
  const d = new Date(`${date}T00:00:00`)
  const day = d.getDay() // 0 = Sunday
  const diff = weekStartsOn === 1 ? (day === 0 ? -6 : 1 - day) : -day
  const start = addDaysStr(date, diff)
  return { from: start, to: addDaysStr(start, 6) }
}

function monthBounds(date: string): PeriodRange {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const last = new Date(y, m, 0).getDate()
  return {
    from: `${date.slice(0, 7)}-01`,
    to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`,
  }
}

export function resolvePeriod(
  period: PeriodName,
  today: string,
  weekStartsOn: 0 | 1,
  custom?: { from?: string | null; to?: string | null },
): PeriodRange {
  switch (period) {
    case 'today':
      return { from: today, to: today }
    case 'this_week':
      return weekBounds(today, weekStartsOn)
    case 'last_week': {
      const w = weekBounds(addDaysStr(today, -7), weekStartsOn)
      return w
    }
    case 'this_month':
      return monthBounds(today)
    case 'last_month': {
      const firstOfThisMonth = `${today.slice(0, 7)}-01`
      return monthBounds(addDaysStr(firstOfThisMonth, -1))
    }
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
    case 'custom':
      return { from: custom?.from ?? null, to: custom?.to ?? null }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

/** Query-string fragment for finance endpoints. */
export function periodQuery(range: PeriodRange): string {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
