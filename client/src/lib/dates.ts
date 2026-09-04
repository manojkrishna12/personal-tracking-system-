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

export const DEFAULT_TZ = 'Asia/Kolkata'

export function todayInTz(timezone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function currentMonth(timezone = DEFAULT_TZ): string {
  return todayInTz(timezone).slice(0, 7)
}

export function currentYear(timezone = DEFAULT_TZ): string {
  return todayInTz(timezone).slice(0, 4)
}

export function parseDate(s: string): Date {
  return parseISO(s)
}

export function fmtDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function addDaysStr(s: string, n: number): string {
  return fmtDate(addDays(parseDate(s), n))
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s))
}

export function isValidMonthString(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s)
}

export function dayLabel(date: string): string {
  return format(parseDate(date), 'EEEE, MMMM d')
}

export function shortDateLabel(date: string): string {
  return format(parseDate(date), 'MMM d')
}

export function monthLabel(month: string): string {
  return format(parseDate(`${month}-01`), 'MMMM yyyy')
}

export function weekBounds(date: string, weekStartsOn: 0 | 1 = 1): { start: string; end: string } {
  const d = parseDate(date)
  return {
    start: fmtDate(startOfWeek(d, { weekStartsOn })),
    end: fmtDate(endOfWeek(d, { weekStartsOn })),
  }
}

export function monthDays(month: string): string[] {
  const start = parseDate(`${month}-01`)
  const interval = { start, end: endOfMonth(start) }
  return eachDayOfInterval(interval).map(fmtDate)
}

export function monthDayGrid(month: string, weekStartsOn: 0 | 1 = 1): string[] {
  const first = parseDate(`${month}-01`)
  const gridStart = startOfWeek(first, { weekStartsOn })
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn })
  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map(fmtDate)
}

export function weekdayHeader(weekStartsOn: 0 | 1 = 1): string[] {
  const names = weekStartsOn === 1 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return names
}

export function yearDays(year: string): string[] {
  const start = parseDate(`${year}-01-01`)
  const end = parseDate(`${year}-12-31`)
  return eachDayOfInterval({ start, end }).map(fmtDate)
}

export function daysInMonthElapsed(month: string, today: string): number {
  if (month > today.slice(0, 7)) return 0
  if (month === today.slice(0, 7)) return Number(today.slice(8, 10))
  const days = monthDays(month).length
  return days
}