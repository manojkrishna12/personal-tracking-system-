// Debt helpers shared by the future UI phases (modal disclosure, Debts page).
// Pure functions only — the server remains authoritative; these mirror its
// rules exactly so the UI can preview what the API will decide.

import type { Debt, SharedExpenseInput } from '../api/types'

/** Outstanding amount for one debt (never negative). */
export function debtOutstandingPaise(debt: Pick<Debt, 'originalPaise' | 'repaidPaise'>): number {
  return Math.max(0, debt.originalPaise - debt.repaidPaise)
}

export type SharedPaymentMode = 'me' | 'someone_else' | 'split'

export interface SharedPreviewInput {
  mode: SharedPaymentMode
  /** Total expense in paise (the amount field). */
  totalPaise: number
  /** Split mode only. */
  mySharePaise?: number
  /** Split mode only — what the user pays out of pocket. */
  paidByMePaise?: number
  payer: string
}

export type SharedPreview =
  | { ok: true; shared: SharedExpenseInput; walletChargePaise: number; debtPaise: number; payer: string }
  | { ok: false; error: string }

/**
 * Mirror of the server's shared-expense rules (routes/finance.ts):
 *   debt   = myShare − paidByMe          (must be > 0 to matter)
 *   charge = paidByMe                    (ONLY this reduces the wallet)
 * Returns an error string for every case the API would reject with 400.
 */
export function previewSharedExpense(input: SharedPreviewInput): SharedPreview {
  const payer = input.payer.trim()
  if (!Number.isInteger(input.totalPaise) || input.totalPaise <= 0) return { ok: false, error: 'Enter a valid total amount' }

  if (input.mode === 'me') {
    return { ok: true, shared: { payer: '', mySharePaise: input.totalPaise, paidByMePaise: input.totalPaise }, walletChargePaise: input.totalPaise, debtPaise: 0, payer: '' }
  }

  const mySharePaise = input.mode === 'someone_else' ? input.totalPaise : (input.mySharePaise ?? 0)
  const paidByMePaise = input.mode === 'someone_else' ? 0 : (input.paidByMePaise ?? 0)

  if (mySharePaise <= 0) return { ok: false, error: 'My share must be greater than zero' }
  if (mySharePaise > input.totalPaise) return { ok: false, error: 'My share cannot exceed the total amount' }
  if (paidByMePaise < 0) return { ok: false, error: 'Amount paid cannot be negative' }
  if (paidByMePaise > mySharePaise) return { ok: false, error: 'Amount paid cannot exceed my share' }

  const debtPaise = mySharePaise - paidByMePaise
  if (debtPaise > 0 && payer.length === 0) return { ok: false, error: 'Who paid the rest?' }

  return {
    ok: true,
    shared: { payer, mySharePaise, paidByMePaise },
    walletChargePaise: paidByMePaise,
    debtPaise,
    payer,
  }
}
