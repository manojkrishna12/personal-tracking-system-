import { describe, expect, it } from 'vitest'
import { debtOutstandingPaise, previewSharedExpense } from './debts'

// Pure mirrors of the server's debt rules (plan §11 matrix, client side).

describe('debtOutstandingPaise', () => {
  it('returns original − repaid', () => {
    expect(debtOutstandingPaise({ originalPaise: 150_000, repaidPaise: 50_000 })).toBe(100_000)
  })
  it('never goes negative', () => {
    expect(debtOutstandingPaise({ originalPaise: 100, repaidPaise: 500 })).toBe(0)
  })
})

describe('previewSharedExpense', () => {
  const base = { totalPaise: 600_000, payer: '' }

  it('me mode: full charge, no debt, no shared block content', () => {
    const r = previewSharedExpense({ ...base, mode: 'me' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.walletChargePaise).toBe(600_000)
      expect(r.debtPaise).toBe(0)
      expect(r.shared.paidByMePaise).toBe(600_000)
      expect(r.shared.mySharePaise).toBe(600_000)
    }
  })

  it('someone_else mode: full share becomes debt, wallet untouched', () => {
    const r = previewSharedExpense({ totalPaise: 50_000, mode: 'someone_else', payer: 'Rahul' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.walletChargePaise).toBe(0)
      expect(r.debtPaise).toBe(50_000)
      expect(r.shared.paidByMePaise).toBe(0)
    }
  })

  it('split mode: ₹6,000 / share ₹3,000 / I pay ₹1,500 → charge ₹1,500, debt ₹1,500', () => {
    const r = previewSharedExpense({ totalPaise: 600_000, mode: 'split', mySharePaise: 300_000, paidByMePaise: 150_000, payer: 'Balaji' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.walletChargePaise).toBe(150_000)
      expect(r.debtPaise).toBe(150_000)
    }
  })

  it('split fully paid by me → no debt, no payer required', () => {
    const r = previewSharedExpense({ totalPaise: 300_000, mode: 'split', mySharePaise: 300_000, paidByMePaise: 300_000, payer: '' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.debtPaise).toBe(0)
  })

  it('rejects share > total', () => {
    const r = previewSharedExpense({ ...base, mode: 'split', mySharePaise: 700_000, paidByMePaise: 0, payer: 'Rahul' })
    expect(r).toMatchObject({ ok: false, error: 'My share cannot exceed the total amount' })
  })

  it('rejects paid > share', () => {
    const r = previewSharedExpense({ ...base, mode: 'split', mySharePaise: 300_000, paidByMePaise: 400_000, payer: 'Rahul' })
    expect(r).toMatchObject({ ok: false, error: 'Amount paid cannot exceed my share' })
  })

  it('rejects zero/negative share in split mode', () => {
    const r = previewSharedExpense({ ...base, mode: 'split', mySharePaise: 0, paidByMePaise: 0, payer: 'Rahul' })
    expect(r.ok).toBe(false)
  })

  it('requires a payer when a debt results', () => {
    const r = previewSharedExpense({ totalPaise: 50_000, mode: 'someone_else', payer: '   ' })
    expect(r).toMatchObject({ ok: false, error: 'Who paid the rest?' })
  })

  it('rejects invalid total', () => {
    const r = previewSharedExpense({ totalPaise: 0, mode: 'me', payer: '' })
    expect(r.ok).toBe(false)
  })
})
