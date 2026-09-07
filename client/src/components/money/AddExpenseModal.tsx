import { useMemo, useState } from 'react'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import { CATEGORIES } from './categories'
import { loadPrefs, savePrefs } from '../../lib/prefs'
import { formatPaise, parseAmountInput, rupeesToPaise } from '../../lib/money'
import { useAddExpense } from '../../hooks/useFinance'
import type { Necessity, WalletKey } from '../../api/types'

interface Props {
  date: string
  balances: Record<WalletKey, number>
  thresholds: Record<WalletKey, number>
  onClose: () => void
  onSaved?: (message: string) => void
}

const NECESSITY_OPTIONS: { value: Necessity; label: string }[] = [
  { value: 'necessary', label: 'Necessary' },
  { value: 'optional', label: 'Optional' },
  { value: 'wasteful', label: 'Wasteful' },
]

/**
 * Fast daily expense entry (plan §13C/§13D): wallet/category/necessity are
 * remembered as UI preferences so the flow is Item → Amount → Save (~4 taps).
 * The after-balance preview is display-only; the server re-validates.
 */
export function AddExpenseModal({ date: defaultDate, balances, thresholds, onClose, onSaved }: Props) {
  const prefs = loadPrefs()
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryKey, setCategoryKey] = useState(prefs.lastCategory ?? 'other')
  const [necessity, setNecessity] = useState<Necessity>(prefs.lastNecessity ?? 'necessary')
  const [wallet, setWallet] = useState<WalletKey>(prefs.lastWallet ?? 'cash')
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const add = useAddExpense()

  const rupees = parseAmountInput(amount)
  const amountPaise = rupees != null ? rupeesToPaise(rupees)! : null
  const balance = balances[wallet] ?? 0
  const afterPaise = amountPaise != null ? balance - amountPaise : null
  const overBalance = afterPaise != null && afterPaise < 0
  const crossesThreshold =
    afterPaise != null && !overBalance && thresholds[wallet] > 0 && afterPaise < thresholds[wallet] && balance >= thresholds[wallet]

  const walletLabel = wallet === 'cash' ? 'Cash' : 'PhonePe'
  const canSubmit = item.trim().length > 0 && amountPaise != null && !overBalance

  const grouped = useMemo(() => {
    const map = new Map<string, typeof CATEGORIES>()
    for (const c of CATEGORIES) {
      const list = map.get(c.group) ?? []
      list.push(c)
      map.set(c.group, list)
    }
    return [...map.entries()]
  }, [])

  function remember() {
    savePrefs({ lastWallet: wallet, lastCategory: categoryKey, lastNecessity: necessity })
  }

  async function submit() {
    if (item.trim().length === 0) {
      setError('What did you buy?')
      return
    }
    if (amountPaise == null) {
      setError('Enter a valid amount (up to 2 decimals)')
      return
    }
    if (overBalance) {
      setError(`Not enough ${walletLabel} — ${formatPaise(balance)} available`)
      return
    }
    setError('')
    try {
      const res = await add.mutateAsync({
        item: item.trim(),
        amountPaise: amountPaise!,
        categoryKey,
        necessity,
        walletKey: wallet,
        date,
        note: note.trim() || undefined,
        clientToken: crypto.randomUUID(),
      })
      remember()
      onSaved?.(res.replayed ? 'Already recorded — showing the existing entry.' : `Recorded. ${walletLabel}: ${formatPaise(res.walletBalancePaise)}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <Modal open onClose={onClose} title="Add Expense" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-muted">Item</label>
            <Input placeholder="e.g. Bus ticket" value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Amount ₹</label>
            <Input inputMode="decimal" placeholder="e.g. 30" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Category</label>
          <Select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
            {grouped.map(([group, cats]) => (
              <optgroup key={group} label={group === 'food' ? 'Food' : group[0]!.toUpperCase() + group.slice(1)}>
                {cats.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Necessity</label>
            <div className="flex gap-1.5">
              {NECESSITY_OPTIONS.map((o) => (
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
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Paid via</label>
            <Select value={wallet} onChange={(e) => setWallet(e.target.value as WalletKey)}>
              <option value="cash">Cash</option>
              <option value="phonepe">PhonePe</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Date</label>
            <Input type="date" value={date} max={defaultDate} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Textarea rows={1} placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="self-end" />
        </div>

        {/* Balance-after preview — display only; the server is authoritative. */}
        {amountPaise != null && !overBalance && (
          <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
            Current {walletLabel}: <span className="font-medium text-ink">{formatPaise(balance)}</span> · After this expense:{' '}
            <span className={`font-medium ${crossesThreshold ? 'text-warn' : 'text-ink'}`}>{formatPaise(afterPaise!)}</span>
          </div>
        )}
        {overBalance && (
          <div className="rounded-md bg-bad/10 px-3 py-2 text-xs font-medium text-bad">
            This exceeds your {walletLabel} balance of {formatPaise(balance)}.
          </div>
        )}
        {crossesThreshold && (
          <div className="rounded-md bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
            ⚠️ This expense will take {walletLabel} below your {formatPaise(thresholds[wallet])} alert threshold.
          </div>
        )}
        {error && <p className="text-xs text-bad">{error}</p>}

        <Button onClick={submit} disabled={add.isPending || !canSubmit} className="w-full">
          {add.isPending ? 'Saving…' : 'Save expense'}
        </Button>
      </div>
    </Modal>
  )
}
