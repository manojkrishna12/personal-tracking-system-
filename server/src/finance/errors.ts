// Typed HTTP errors for finance operations, handled by the central error middleware.

export class FinanceError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'FinanceError'
    this.status = status
    this.code = code
    this.details = details
  }
}
