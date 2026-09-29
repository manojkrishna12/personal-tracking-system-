// Debts — obligations created when someone else pays (fully or partly) for an
// expense recorded in the ledger (plan §3 of the debt feature design).
//
// The ledger remains the single source of truth for actual money movement:
// a Debt never stores wallet balances and never touches Cash/PhonePe. It
// links to the expense transaction that created it via `transactionId`, and
// that transaction carries the same id back in its `debtId` field.
//
// Repayment (Phase 2) will increment `repaidPaise` with linked wallet-outflow
// transactions; until then `repaidPaise` stays 0 and status stays 'outstanding'.

import { Schema, model, Types } from 'mongoose'

export type DebtStatus = 'outstanding' | 'settled'

export interface DebtDoc {
  _id: Types.ObjectId
  userId: Types.ObjectId
  /** Who the user owes (free text, case preserved; grouped case-insensitively). */
  person: string
  /** Why the user owes (item/reason shown in the Debts page). */
  item: string
  categoryKey?: string | null
  date: string // YYYY-MM-DD
  /** Total owed when the debt was created. Always > 0. */
  originalPaise: number
  /** Amount already repaid (Phase 2). Always >= 0 and <= originalPaise. */
  repaidPaise: number
  /** The ledger expense transaction that created this debt. */
  transactionId: Types.ObjectId
  status: DebtStatus
  note?: string | null
  clientToken?: string | null
  createdAt: Date
  updatedAt: Date
}

const debtSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    person: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    item: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    categoryKey: { type: String, default: null, maxlength: 40 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    originalPaise: { type: Number, required: true, min: 1, max: 100_000_000 },
    repaidPaise: { type: Number, required: true, min: 0, default: 0 },
    transactionId: { type: Schema.Types.ObjectId, ref: 'FinanceTransaction', required: true },
    status: { type: String, enum: ['outstanding', 'settled'], required: true, default: 'outstanding' },
    note: { type: String, default: null, maxlength: 500 },
    clientToken: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: true },
)

debtSchema.index({ userId: 1, status: 1, date: -1 })
debtSchema.index({ userId: 1, person: 1 })
// One debt per creating expense transaction.
debtSchema.index(
  { userId: 1, transactionId: 1 },
  { unique: true, partialFilterExpression: { transactionId: { $type: 'string' } } },
)
// Idempotent creation: a repeated submit with the same clientToken cannot
// insert twice (mirrors the ledger's partial-unique index pattern).
debtSchema.index(
  { userId: 1, clientToken: 1 },
  { unique: true, partialFilterExpression: { clientToken: { $type: 'string' } } },
)

export const Debt = model<DebtDoc>('Debt', debtSchema)
