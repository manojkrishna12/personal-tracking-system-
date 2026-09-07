// Exact money helpers for the client — mirrors server/src/finance/money.ts.
// Amounts cross the API as integer paise; the ledger is always exact.

export const MAX_EXPENSE_PAISE = 100_000_000 // ₹10,00,000 per transaction

export function rupeesToPaise(rupees: number): number | null {
  if (!Number.isFinite(rupees)) return null
  const paise = Math.round(rupees * 100)
  if (Math.abs(paise - rupees * 100) > 1e-6) return null
  return paise
}

export function paiseToRupees(paise: number): number {
  return paise / 100
}

/** Parse a user-typed rupee amount; null when invalid (e.g. 3 decimals). */
export function parseAmountInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : null
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Format integer paise as INR, e.g. 125000 → "₹1,250", 35050 → "₹350.50". */
export function formatPaise(paise: number): string {
  const formatted = inr.format(paiseToRupees(Math.abs(paise)))
  return paise < 0 ? `−${formatted}` : formatted
}

/** Signed display for a transaction: +₹ for inflows, −₹ for outflows. */
export function formatSignedPaise(paise: number): string {
  return `${paise < 0 ? '−' : '+'}${inr.format(paiseToRupees(Math.abs(paise)))}`
}
