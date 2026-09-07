// Exact money arithmetic — the ledger stores signed integer paise
// (plan §10). Floating-point rupees never cross the ledger boundary.

export const MAX_TRANSACTION_PAISE = 100_000_000 // ₹10,00,000 per transaction

/**
 * Convert a rupee amount (e.g. 350.5) to integer paise (35050).
 * Rejects more than two decimal places — callers surface a validation error.
 */
export function rupeesToPaise(rupees: number): number | null {
  if (!Number.isFinite(rupees)) return null
  const paise = Math.round(rupees * 100)
  // Round-trip check: any hidden third decimal makes this mismatch.
  if (Math.abs(paise - rupees * 100) > 1e-6) return null
  return paise
}

export function paiseToRupees(paise: number): number {
  return paise / 100
}

export function isValidPaise(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n !== 0 && Math.abs(n) <= MAX_TRANSACTION_PAISE
}

/** Format integer paise as INR, e.g. 125000 → "₹1,250", 35050 → "₹350.50". */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paiseToRupees(paise))
}

/** Signed helper: a positive paise amount stored as an expense is negative. */
export function signedExpense(paise: number): number {
  return -Math.abs(paise)
}
