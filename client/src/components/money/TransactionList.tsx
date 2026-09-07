import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea } from '../ui'
import { CATEGORIES, NECESSITY_LABEL, categoryLabel } from './categories'
import { formatPaise, formatSignedPaise, parseAmountInput, rupeesToPaise } from '../../lib/money'
import { useDeleteTransaction, useEditTransaction, useFinanceTransactions, type TransactionFilters as Filters } from '../../hooks/useFinance'
import type { FinanceTransaction, Necessity, WalletKey } from '../../api/types'

const TYPE_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance',
  money_received: 'Money received',
  expense: 'Expense',
  balance_adjustment: 'Adjustment',
}

function typeBadge(t: FinanceTransaction) {
  if (t.type === 'money_received') return <Badge tone="good">+ Money received</Badge>
  if (t.type === 'expense') return <Badge tone="bad">− Expense</Badge>
  if (t.type === 'balance_adjustment') return <Badge tone="warn">± Adjustment</Badge>
  return <Badge>Opening</Badge>
}

function describe(t: FinanceTransaction): string {
  if (t.type === 'expense') return t.item ?? 'Expense'
  if (t.type === 'money_received') return `${t.source ?? 'Someone'} → ${t.walletKey === 'cash' ? 'Cash' : 'PhonePe'}`
  if (t.type === 'balance_adjustment') return t.reason ?? 'Balance adjustment'
  return `Opening balance — ${t.walletKey === 'cash' ? 'Cash' : 'PhonePe'}`
}

// ---------------------------------------------------------------------------
// Edit modal — shows the balance impact before saving.
// ---------------------------------------------------------------------------

function EditModal({ txn, onClose, balances }: { txn: FinanceTransaction; onClose: () => void; balances: Record<WalletKey, number> }) {
  const edit = useEditTransaction()
  const isExpense = txn.type === 'expense'
  const isAdjustment = txn.type === 'balance_adjustment'
  // Amounts are editable for received/expense rows; adjustments keep their
  // delta (edit the reason instead) — simplest safe UX.
  const amountEditable = !isAdjustment

  const [item, setItem] = useState(txn.item ?? '')
  const [amount, setAmount] = useState(String(Math.abs(txn.amountPaise) / 100))
  const [wallet, setWallet] = useState<WalletKey>(txn.walletKey)
  const [categoryKey, setCategoryKey] = useState(txn.categoryKey ?? 'other')
  const [necessity, setNecessity] = useState<Necessity>(txn.necessity ?? 'necessary')
  const [source, setSource] = useState(txn.source ?? '')
  const [reason, setReason] = useState(txn.reason ?? '')
  const [note, setNote] = useState(txn.note ?? '')
  const [error, setError] = useState('')

  const parsedRupees = amountEditable ? parseAmountInput(amount) : null
  const newPaise = !amountEditable ? txn.amountPaise : parsedRupees != null ? rupeesToPaise(parsedRupees) : null
  // Projected destination balance: current − old (if same wallet) + new signed.
  const signedNew = newPaise != null ? (isExpense ? -newPaise : newPaise) : null
  const projected =
    signedNew != null
      ? (balances[wallet] ?? 0) + (wallet === txn.walletKey ? -txn.amountPaise : 0) + signedNew
      : null
  const invalid = projected != null && projected < 0
  // Balance the edit applies on top of: current balance minus this txn's own effect.
  const currentAmount = (balances[wallet] ?? 0) - (wallet === txn.walletKey ? txn.amountPaise : 0)

  async function save() {
    if (!amountEditable) {
      setError('')
      try {
        await edit.mutateAsync({
          id: txn._id,
          patch: {
            walletKey: wallet,
            reason: reason.trim(),
            note: note.trim() || null,
          },
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save')
      }
      return
    }
    if (newPaise == null || Number.isNaN(newPaise)) {
      setError('Enter a valid amount')
      return
    }
    if (invalid) {
      setError('This change would make the wallet negative')
      return
    }
    setError('')
    try {
      await edit.mutateAsync({
        id: txn._id,
        patch: {
          ...(isExpense ? { item: item.trim(), categoryKey, necessity } : { source: source.trim() || 'Dad' }),
          amountPaise: newPaise,
          walletKey: wallet,
          note: note.trim() || null,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${TYPE_LABEL[txn.type] ?? 'transaction'}`} wide>
      <div className="space-y-3">
        {isExpense && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted">Item</label>
              <Input value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted">Category</label>
                <Select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Necessity</label>
                <Select value={necessity} onChange={(e) => setNecessity(e.target.value as Necessity)}>
                  <option value="necessary">Necessary</option>
                  <option value="optional">Optional</option>
                  <option value="wasteful">Wasteful</option>
                </Select>
              </div>
            </div>
          </>
        )}
        {txn.type === 'money_received' && (
          <div>
            <label className="mb-1 block text-xs text-muted">Source</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} />
          </div>
        )}
        {txn.type === 'balance_adjustment' && (
          <div>
            <label className="mb-1 block text-xs text-muted">Reason (required)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {amountEditable && (
            <div>
              <label className="mb-1 block text-xs text-muted">Amount ₹</label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}
          <div className={amountEditable ? '' : 'col-span-2'}>
            <label className="mb-1 block text-xs text-muted">Wallet</label>
            <Select value={wallet} onChange={(e) => setWallet(e.target.value as WalletKey)}>
              <option value="cash">Cash</option>
              <option value="phonepe">PhonePe</option>
            </Select>
          </div>
        </div>
        <Textarea rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />

        {projected != null && !invalid && (
          <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
            {walletLabel(wallet)} after this change: <span className="font-medium text-ink">{formatPaise(projected)}</span> (was{' '}
            {formatPaise(Math.abs(txn.amountPaise))} — {currentAmount})
          </div>
        )}
        {invalid && <p className="text-xs font-medium text-bad">This change would make {walletLabel(wallet)} negative — rejected by the server too.</p>}
        {error && <p className="text-xs text-bad">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={save} disabled={edit.isPending || invalid} className="flex-1">
            {edit.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function walletLabel(w: WalletKey): string {
  return w === 'cash' ? 'Cash' : 'PhonePe'
}

// ---------------------------------------------------------------------------
// The list.
// ---------------------------------------------------------------------------

interface ListProps {
  filters: Filters
  balances: Record<WalletKey, number>
  emptyMessage: string
}

export function TransactionList({ filters, balances, emptyMessage }: ListProps) {
  const query = useFinanceTransactions(filters)
  const del = useDeleteTransaction()
  const [editing, setEditing] = useState<FinanceTransaction | null>(null)
  const [deleting, setDeleting] = useState<FinanceTransaction | null>(null)

  if (query.isLoading) return <Card>Loading…</Card>
  if (query.isError) return <Card>Could not load transactions.</Card>

  const txns = query.data?.transactions ?? []
  const grouped = new Map<string, FinanceTransaction[]>()
  for (const t of txns) {
    const list = grouped.get(t.date) ?? []
    list.push(t)
    grouped.set(t.date, list)
  }

  return (
    <>
      {txns.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([date, list]) => (
            <div key={date}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{date}</div>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {list.map((t) => (
                  <li key={t._id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{describe(t)}</span>
                        {typeBadge(t)}
                        {t.necessity && (
                          <span className={`text-[10px] uppercase tracking-wider ${t.necessity === 'wasteful' ? 'text-bad' : t.necessity === 'optional' ? 'text-warn' : 'text-good'}`}>
                            {NECESSITY_LABEL[t.necessity]}
                          </span>
                        )}
                        {t.type === 'expense' && t.categoryKey && <span className="text-xs text-muted">{categoryLabel(t.categoryKey)}</span>}
                      </div>
                      {t.note && <div className="truncate text-xs text-muted">{t.note}</div>}
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${t.amountPaise < 0 ? 'text-ink' : 'text-good'}`}>
                      {formatSignedPaise(t.amountPaise)}
                    </span>
                    <div className="flex shrink-0 gap-2 text-xs">
                      <button onClick={() => setEditing(t)} className="text-muted hover:text-ink">
                        Edit
                      </button>
                      {t.type !== 'opening_balance' && (
                        <button onClick={() => setDeleting(t)} className="text-muted hover:text-bad">
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {query.data?.nextCursor && <p className="text-center text-xs text-muted">Older transactions are covered by the date filters and CSV export.</p>}
        </div>
      )}

      {editing && <EditModal txn={editing} balances={balances} onClose={() => setEditing(null)} />}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title="Delete transaction?">
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              <span className="font-medium text-ink">{describe(deleting)}</span> · {formatSignedPaise(deleting.amountPaise)} on{' '}
              {deleting.date}
            </p>
            <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
              {walletLabel(deleting.walletKey)} would go from {formatPaise(balances[deleting.walletKey] ?? 0)} to{' '}
              <span className="font-medium text-ink">{formatPaise((balances[deleting.walletKey] ?? 0) - deleting.amountPaise)}</span>.
            </div>
            <p className="text-xs text-muted">Analytics and balances update automatically. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await del.mutateAsync(deleting._id)
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : 'Could not delete')
                  }
                  setDeleting(null)
                }}
                className="flex-1"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
