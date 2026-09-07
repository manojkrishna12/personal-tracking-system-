import { describe, expect, it } from 'vitest'
import { rupeesToPaise, paiseToRupees, isValidPaise, formatPaise, MAX_TRANSACTION_PAISE } from '../src/finance/money'
import { resolvePeriod, previousPeriod, daysBetweenInclusive } from '../src/finance/periods'

describe('money', () => {
  it('converts rupees to paise exactly', () => {
    expect(rupeesToPaise(350)).toBe(35_000)
    expect(rupeesToPaise(350.5)).toBe(35_050)
    expect(rupeesToPaise(0.01)).toBe(1)
  })

  it('rejects more than two decimal places', () => {
    expect(rupeesToPaise(10.999)).toBeNull()
    expect(rupeesToPaise(Number.NaN)).toBeNull()
  })

  it('round-trips paise', () => {
    expect(paiseToRupees(35_050)).toBe(350.5)
    expect(paiseToRupees(0)).toBe(0)
  })

  it('validates paise integers within the cap', () => {
    expect(isValidPaise(1)).toBe(true)
    expect(isValidPaise(-1)).toBe(true)
    expect(isValidPaise(0)).toBe(false)
    expect(isValidPaise(1.5)).toBe(false)
    expect(isValidPaise(MAX_TRANSACTION_PAISE)).toBe(true)
    expect(isValidPaise(MAX_TRANSACTION_PAISE + 1)).toBe(false)
  })

  it('formats INR from paise', () => {
    expect(formatPaise(125_000)).toBe('₹1,250')
    expect(formatPaise(35_050)).toBe('₹350.50')
    expect(formatPaise(-18_000)).toBe('-₹180')
  })
})

// Week starts Monday (weekStartsOn = 1). 2026-08-10 is a Monday.
describe('periods', () => {
  it('resolves today', () => {
    expect(resolvePeriod('today', '2026-08-10', 1)).toEqual({ from: '2026-08-10', to: '2026-08-10' })
  })

  it('resolves this week and last week', () => {
    expect(resolvePeriod('this_week', '2026-08-12', 1)).toEqual({ from: '2026-08-10', to: '2026-08-16' })
    expect(resolvePeriod('last_week', '2026-08-12', 1)).toEqual({ from: '2026-08-03', to: '2026-08-09' })
  })

  it('resolves months', () => {
    expect(resolvePeriod('this_month', '2026-08-12', 1)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(resolvePeriod('last_month', '2026-08-12', 1)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('resolves the year and all time', () => {
    expect(resolvePeriod('this_year', '2026-08-12', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(resolvePeriod('all', '2026-08-12', 1)).toEqual({ from: null, to: null })
  })

  it('resolves custom ranges', () => {
    expect(resolvePeriod('custom', '2026-08-12', 1, { from: '2026-08-01', to: '2026-08-15' })).toEqual({ from: '2026-08-01', to: '2026-08-15' })
  })

  it('computes the previous period', () => {
    expect(previousPeriod({ from: '2026-08-10', to: '2026-08-16' })).toEqual({ from: '2026-08-03', to: '2026-08-09' })
    expect(previousPeriod({ from: '2026-08-01', to: '2026-08-31' })).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('counts days inclusively', () => {
    expect(daysBetweenInclusive('2026-08-01', '2026-08-31')).toBe(31)
    expect(daysBetweenInclusive('2026-08-10', '2026-08-10')).toBe(1)
  })
})
