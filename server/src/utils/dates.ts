import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MONTH_RE = /^\d{4}-\d{2}$/
export const YEAR_RE = /^\d{4}$/

export function isValidDateString(s: string): boolean {
  return DATE_RE.test(s) && isValid(parseISO(s))
}

export function isValidMonthString(s: string): boolean {
  if (!MONTH_RE.test(s)) return false
  const [y, m] = s.split('-').map(Number)
  return typeof y === 'number' && typeof m === 'number' && m >= 1 && m <= 12
}

// Date strings are plain local dates — no timezone drift.
export function parseDate(s: string): Date {
  return parseISO(s)
}

export function fmtDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function todayInTz(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function addDaysStr(s: string, n: number): string {
  return fmtDate(addDays(parseDate(s), n))
}

// Lexicographic comparison is correct for zero-padded ISO dates.
export function isFutureDate(date: string, today: string): boolean {
  return date > today
}

export function weekBounds(date: string, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6): { start: string; end: string } {
  const d = parseDate(date)
  return {
    start: fmtDate(startOfWeek(d, { weekStartsOn })),
    end: fmtDate(endOfWeek(d, { weekStartsOn })),
  }
}

export function monthBounds(date: string): { start: string; end: string } {
  const d = parseDate(date)
  return { start: fmtDate(startOfMonth(d)), end: fmtDate(endOfMonth(d)) }
}

export function eachDayStr(start: string, end: string): string[] {
  return eachDayOfInterval({ start: parseDate(start), end: parseDate(end) }).map(fmtDate)
}

export function yearBounds(year: string): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

export function dayLabel(date: string): string {
  return format(parseDate(date), 'EEEE, MMMM d')
}

export function monthLabel(month: string): string {
  return format(parseDate(`${month}-01`), 'MMMM yyyy')
}

export function weekdayShortLabel(weekdayIndex: number): string {
  // 0 = Sunday … 6 = Saturday
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayIndex] ?? ''
}

export function yearLabel(year: string): string {
  return year
}

export function isSameDay(a: Date, b: Date): boolean {
  return fmtDate(a) === fmtDate(b)
}