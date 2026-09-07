// The financial ledger — the single source of truth for money (plan §5/§6).
// amountPaise is SIGNED: positive = inflow, negative = outflow.

import { Schema, model, Types } from 'mongoose'

export const TRANSACTION_TYPES = ['opening_balance', 'money_received', 'expense', 'balance_adjustment'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export interface OpeningBalanceHistoryEntry {
  amountPaise: number
  changedAt: Date
}

export interface FinanceTransactionDoc {
  _id: Types.ObjectId
  userId: Types.ObjectId
  walletKey: 'cash' | 'phonepe'
  type: TransactionType
  date: string
  amountPaise: number
  source?: string | null
  item?: string | null
  categoryKey?: string | null
  necessity?: 'necessary' | 'optional' | 'wasteful' | null
  reason?: string | null
  note?: string | null
  clientToken?: string | null
  history?: OpeningBalanceHistoryEntry[]
  createdAt: Date
  updatedAt: Date
}

const historyEntrySchema = new Schema(
  {
    amountPaise: { type: Number, required: true },
    changedAt: { type: Date, required: true },
  },
  { _id: false },
)

const financeTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    walletKey: { type: String, required: true, enum: ['cash', 'phonepe'] },
    type: { type: String, required: true, enum: TRANSACTION_TYPES },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    amountPaise: { type: Number, required: true, min: -100_000_000, max: 100_000_000 },
    source: { type: String, default: null, maxlength: 60 },
    item: { type: String, default: null, maxlength: 80 },
    categoryKey: { type: String, default: null, maxlength: 40 },
    necessity: { type: String, enum: ['necessary', 'optional', 'wasteful'], default: null },
    reason: { type: String, default: null, maxlength: 300 },
    note: { type: String, default: null, maxlength: 500 },
    clientToken: { type: String, default: null, maxlength: 64 },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true },
)

financeTransactionSchema.index({ userId: 1, date: 1 })
financeTransactionSchema.index({ userId: 1, walletKey: 1, date: 1 })
financeTransactionSchema.index({ userId: 1, type: 1, date: 1 })
// Idempotency: a repeated submit with the same clientToken cannot insert twice.
// $type filter so documents without a token (stored as null) are excluded —
// { $exists: true } would match explicit nulls and wrongly collide.
financeTransactionSchema.index(
  { userId: 1, clientToken: 1 },
  { unique: true, partialFilterExpression: { clientToken: { $type: 'string' } } },
)
// At most ONE opening balance per wallet — the ledger's foundation.
financeTransactionSchema.index(
  { userId: 1, walletKey: 1 },
  { unique: true, partialFilterExpression: { type: 'opening_balance' } },
)

export const FinanceTransaction = model<FinanceTransactionDoc>('FinanceTransaction', financeTransactionSchema)
