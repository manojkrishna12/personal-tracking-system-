// Period semantics shared by every finance endpoint (plan §5A).
// Pure functions of (period, today, weekStartsOn) so client and server
// compute identical bounds — parity is covered by tests on both sides.

import { addDaysStr, monthBounds, weekBounds, yearBounds } from '../utils/dates'

export const PERIODS = [
  'today',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'custom',
  'all',
] as const

export type PeriodName = (typeof PERIODS)[number]

export interface PeriodRange {
  from: string | null // inclusive YYYY-MM-DD, null = unbounded
  to: string | null // inclusive YYYY-MM-DD, null = unbounded
}

export function resolvePeriod(
  period: PeriodName,
  today: string,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  custom?: { from?: string | null; to?: string | null },
): PeriodRange {
  switch (period) {
    case 'today':
      return { from: today, to: today }
    case 'this_week': {
      const { start, end } = weekBounds(today, weekStartsOn)
      return { from: start, to: end }
    }
    case 'last_week': {
      const { start, end } = weekBounds(addDaysStr(today, -7), weekStartsOn)
      return { from: start, to: end }
    }
    case 'this_month': {
      const { start, end } = monthBounds(today)
      return { from: start, to: end }
    }
    case 'last_month': {
      const { start, end } = monthBounds(addDaysStr(`${today.slice(0, 7)}-01`, -1))
      return { from: start, to: end }
    }
    case 'this_year': {
      const { start, end } = yearBounds(today.slice(0, 4))
      return { from: start, to: end }
    }
    case 'custom':
      return {
        from: custom?.from ?? null,
        to: custom?.to ?? null,
      }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

/** The period immediately before the given range (for comparisons). */
export function previousPeriod(range: PeriodRange): PeriodRange {
  if (!range.from || !range.to) return { from: null, to: null }
  const spanDays = daysBetweenInclusive(range.from, range.to)
  const to = addDaysStr(range.from, -1)
  const from = addDaysStr(to, -(spanDays - 1))
  return { from, to }
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}
