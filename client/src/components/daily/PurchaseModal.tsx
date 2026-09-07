import { useState } from 'react'
import { Badge, Button, Input, Modal, Select, Textarea } from '../ui'
import { CATEGORIES } from '../money/categories'
import { formatPaise, parseAmountInput, rupeesToPaise } from '../../lib/money'
import { useAddExpense, useDeleteTransaction, useFinanceTransactions } from '../../hooks/useFinance'
import { loadPrefs, savePrefs } from '../../lib/prefs'
import type { Necessity, Purchase, WalletKey } from '../../api/types'

interface Props {
  date: string
  /** Legacy embedded purchases without a ledger entry (converted via Settings → Money). */
  embedded: Purchase[]
  balances: Record<WalletKey, number>
  thresholds: Record<WalletKey, number>
  onClose: () => void
}

const NECESSITY: { value: Necessity; label: string }[] = [
  { value: 'necessary', label: 'Necessary' },
  { value: 'optional', label: 'Optional' },
  { value: 'wasteful', label: 'Wasteful' },
]

/**
 * Things Bought for a day (plan §0/§11): each real-world purchase is exactly
 * one FinanceTransaction dated today; nothing is mirrored into the day record.
 */
export default function PurchaseModal({ date, embedded, balances, thresholds, onClose }: Props) {
  const query = useFinanceTransactions({ date, type: 'expense', limit: 100 })
  const add = useAddExpense()
  const del = useDeleteTransaction()
  const prefs = loadPrefs()

  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryKey, setCategoryKey] = useState(prefs.lastCategory ?? 'other')
  const [necessity, setNecessity] = useState<Necessity>(prefs.lastNecessity ?? 'necessary')
  const [wallet, setWallet] = useState<WalletKey>(prefs.lastWallet ?? 'cash')
  const [error, setError] = useState('')

  const rupees = parseAmountInput(amount)
  const amountPaise = rupees != null ? rupeesToPaise(rupees) : null
  const overBalance = amountPaise != null && amountPaise > (balances[wallet] ?? 0)
  const canAdd = item.trim().length > 0 && amountPaise != null && !overBalance

  async function addPurchase() {
    if (!canAdd || amountPaise == null) {
      setError(item.trim() ? 'Enter a valid amount' : 'What did you buy?')
      return
    }
    setError('')
    try {
      await add.mutateAsync({
        item: item.trim(),
        amountPaise: amountPaise!,
        categoryKey,
        necessity,
        walletKey: wallet,
        date,
        clientToken: crypto.randomUUID(),
      })
      savePrefs({ lastWallet: wallet, lastCategory: categoryKey, lastNecessity: necessity })
      setItem('')
      setAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <Modal open onClose={onClose} title="Things Bought" wide>
      <div className="space-y-4">
        {(query.data?.transactions.length ?? 0) + embedded.length > 0 && (
          <ul className="space-y-1.5">
            {(query.data?.transactions ?? []).map((t) => (
              <li key={t._id} className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{t.item}</span>
                  <span className="ml-2 text-xs text-muted">{CATEGORIES.find((c) => c.key === t.categoryKey)?.label ?? ''}</span>
                  {t.necessity && (
                    <span className={`ml-2 text-xs ${t.necessity === 'wasteful' ? 'text-bad' : t.necessity === 'optional' ? 'text-warn' : 'text-good'}`}>
                      {t.necessity}
                    </span>
                  )}
                  <span className="ml-2 text-xs text-muted">{t.walletKey === 'cash' ? 'Cash' : 'PhonePe'}</span>
                  {t.note ? <div className="truncate text-xs text-muted">{t.note}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-ink">{formatPaise(Math.abs(t.amountPaise))}</span>
                  <button
                    onClick={async () => {
                      try {
                        await del.mutateAsync(t._id)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Could not delete')
                      }
                    }}
                    className="text-xs text-muted hover:text-bad"
                    aria-label={`Remove ${t.item}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {embedded.map((p, i) => (
              <li key={`legacy-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-line px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{p.item}</span>
                  <span className="ml-2 text-xs text-muted">{p.category}</span>
                  <Badge tone="warn">untracked</Badge>
                  <div className="text-xs text-muted">Not in a wallet yet — assign one in Settings → Money.</div>
                </div>
                <span className="shrink-0 text-ink">₹{p.amount.toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-md border border-line p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Add a purchase</div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Item" value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} />
            <Input placeholder="Amount ₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-1.5">
              {NECESSITY.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setNecessity(o.value)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                    necessity === o.value
                      ? o.value === 'necessary'
                        ? 'border-good/60 bg-good/10 text-good'
                        : o.value === 'wasteful'
                          ? 'border-bad/60 bg-bad/10 text-bad'
                          : 'border-warn/60 bg-warn/10 text-warn'
                      : 'border-line text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Select value={wallet} onChange={(e) => setWallet(e.target.value as WalletKey)}>
              <option value="cash">Cash</option>
              <option value="phonepe">PhonePe</option>
            </Select>
          </div>
          {overBalance && <p className="text-xs font-medium text-bad">This exceeds your {wallet === 'cash' ? 'Cash' : 'PhonePe'} balance of {formatPaise(balances[wallet] ?? 0)}.</p>}
          {error ? <p className="text-xs text-bad">{error}</p> : null}
          <Button onClick={addPurchase} disabled={add.isPending || !canAdd} className="w-full">
            {add.isPending ? 'Saving…' : 'Add purchase'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
