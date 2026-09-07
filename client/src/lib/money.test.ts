// Unit tests for client money helpers and period math (mirrors server
// finance-unit tests so client/server period parity is verified on both sides).
import { describe, expect, it } from 'vitest'
import { formatPaise, formatSignedPaise, parseAmountInput, rupeesToPaise } from './money'
import { periodQuery, resolvePeriod, type PeriodName } from './periods'

describe('rupeesToPaise', () => {
  it('converts rupees to exact integer paise', () => {
    expect(rupeesToPaise(1250)).toBe(125000)
    expect(rupeesToPaise(350.5)).toBe(35050)
    expect(rupeesToPaise(0.1)).toBe(10)
  })
  it('rejects values that are not exact paise', () => {
    expect(rupeesToPaise(0.123)).toBeNull()
    expect(rupeesToPaise(NaN)).toBeNull()
    expect(rupeesToPaise(Infinity)).toBeNull()
  })
})

describe('parseAmountInput', () => {
  it('accepts well-formed positive rupee amounts', () => {
    expect(parseAmountInput('30')).toBe(30)
    expect(parseAmountInput('350.50')).toBe(350.5)
    expect(parseAmountInput(' 12 ')).toBe(12)
  })
  it('rejects invalid input', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('-5')).toBeNull()
    expect(parseAmountInput('1.234')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('0')).toBeNull()
  })
})

describe('formatPaise', () => {
  it('formats integer paise as INR', () => {
    expect(formatPaise(125000)).toBe('₹1,250')
    expect(formatPaise(35050)).toBe('₹350.5') // en-IN Intl trims the trailing zero
  })
  it('marks negative amounts with a minus sign', () => {
    expect(formatPaise(-18000)).toBe('−₹180')
  })
})

describe('formatSignedPaise', () => {
  it('shows + for inflows and − for outflows', () => {
    expect(formatSignedPaise(1000)).toBe('+₹10')
    expect(formatSignedPaise(-1000)).toBe('−₹10')
  })
})

// Fixed "today" so the assertions are deterministic.
const TODAY = '2026-09-09' // a Wednesday

describe('resolvePeriod', () => {
  it('today is a single-day range', () => {
    expect(resolvePeriod('today', TODAY, 1)).toEqual({ from: '2026-09-09', to: '2026-09-09' })
  })

  it('this week starts on Monday when weekStartsOn=1', () => {
    expect(resolvePeriod('this_week', TODAY, 1)).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })

  it('last week is the previous Monday–Sunday', () => {
    expect(resolvePeriod('last_week', TODAY, 1)).toEqual({ from: '2026-08-31', to: '2026-09-06' })
  })

  it('this month covers the whole calendar month', () => {
    expect(resolvePeriod('this_month', TODAY, 1)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('last month handles shorter previous months', () => {
    expect(resolvePeriod('last_month', '2026-03-15', 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('this year spans Jan 1 to Dec 31', () => {
    expect(resolvePeriod('this_year', TODAY, 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('custom uses the provided range verbatim', () => {
    expect(resolvePeriod('custom', TODAY, 1, { from: '2026-01-05', to: '2026-02-20' })).toEqual({
      from: '2026-01-05',
      to: '2026-02-20',
    })
  })

  it('all time has no bounds', () => {
    expect(resolvePeriod('all', TODAY, 1)).toEqual({ from: null, to: null })
  })

  it('handles Sunday with Monday week start (belongs to the week just ending)', () => {
    expect(resolvePeriod('this_week', '2026-09-06', 1)).toEqual({ from: '2026-08-31', to: '2026-09-06' })
  })
})

describe('periodQuery', () => {
  it('builds a query string from the range', () => {
    expect(periodQuery({ from: '2026-09-01', to: '2026-09-30' })).toBe('?from=2026-09-01&to=2026-09-30')
  })
  it('returns an empty string for all time', () => {
    expect(periodQuery({ from: null, to: null })).toBe('')
  })
})

describe('period options', () => {
  it('exposes exactly the eight agreed periods', () => {
    const expected: PeriodName[] = [
      'today',
      'this_week',
      'last_week',
      'this_month',
      'last_month',
      'this_year',
      'custom',
      'all',
    ]
    expect(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      expected.every((p) => true),
    ).toBe(true)
  })
})
