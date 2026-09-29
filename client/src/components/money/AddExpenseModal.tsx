import { useMemo, useState } from 'react'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import { CATEGORIES } from './categories'
import { loadPrefs, savePrefs } from '../../lib/prefs'
import { formatPaise, parseAmountInput, rupeesToPaise } from '../../lib/money'
import { previewSharedExpense, type SharedPaymentMode } from '../../lib/debts'
import { useAddExpense, useDebtPeople } from '../../hooks/useFinance'
import type { Necessity, SharedExpenseInput, WalletKey } from '../../api/types'

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

const ARRANGEMENTS: { value: SharedPaymentMode; label: string }[] = [
  { value: 'me', label: 'Me' },
  { value: 'someone_else', label: 'Someone else' },
  { value: 'split', label: 'Split' },
]

/**
 * Fast daily expense entry (plan §13C/§13D): wallet/category/necessity are
 * remembered as UI preferences so the flow is Item → Amount → Save (~4 taps).
 * The after-balance preview is display-only; the server re-validates.
 *
 * Shared payment (debt feature) is progressive disclosure: hidden behind one
 * quiet toggle. OFF = the exact original form; ON = a compact arrangement
 * section whose math comes from previewSharedExpense() — the pure mirror of
 * the server's rules. The server remains authoritative either way.
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
  // Shared-payment disclosure state — OFF by default, reset after save.
  const [sharedOpen, setSharedOpen] = useState(false)
  const [mode, setMode] = useState<SharedPaymentMode>('me')
  const [myShare, setMyShare] = useState('')
  const [paidByMe, setPaidByMe] = useState('')
  const [payer, setPayer] = useState('')
  const add = useAddExpense()
  const people = useDebtPeople()

  const rupees = parseAmountInput(amount)
  const amountPaise = rupees != null ? rupeesToPaise(rupees)! : null

  // Shared preview — derived via the shared helper, never re-implemented here.
  // In split mode an empty "I paid" reads as 0 for live feedback (the same
  // derivation the API performs); submit still requires exact parses.
  const sharedPreview = useMemo(() => {
    if (!sharedOpen || mode === 'me' || amountPaise == null) return null
    const shareRupees = mode === 'split' ? parseAmountInput(myShare) : amountPaise
    const paidRupees = mode === 'split' ? (paidByMe.trim() === '' ? 0 : parseAmountInput(paidByMe)) : 0
    return previewSharedExpense({
      mode,
      totalPaise: amountPaise,
      mySharePaise: (shareRupees != null ? rupeesToPaise(shareRupees) : 0) ?? 0,
      paidByMePaise: (paidRupees != null ? rupeesToPaise(paidRupees) : 0) ?? 0,
      payer,
    })
  }, [sharedOpen, mode, amountPaise, myShare, paidByMe, payer])

  const balance = balances[wallet] ?? 0
  // The wallet is charged only the out-of-pocket amount in shared mode.
  const chargePaise = sharedPreview?.ok ? sharedPreview.walletChargePaise : amountPaise
  const afterPaise = chargePaise != null ? balance - chargePaise : null
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

  function resetShared() {
    setSharedOpen(false)
    setMode('me')
    setMyShare('')
    setPaidByMe('')
    setPayer('')
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

    // Me arrangement (and closed toggle) = a normal expense: no shared payload.
    let shared: SharedExpenseInput | undefined
    if (sharedOpen && mode !== 'me') {
      const shareRupees = mode === 'split' ? parseAmountInput(myShare) : amountPaise!
      const paidRupees = mode === 'split' ? parseAmountInput(paidByMe) : 0
      if (mode === 'split' && shareRupees == null) {
        setError('Enter a valid My share amount')
        return
      }
      if (mode === 'split' && paidByMe.trim() !== '' && paidRupees == null) {
        setError('Enter a valid "I paid" amount')
        return
      }
      const preview = previewSharedExpense({
        mode,
        totalPaise: amountPaise!,
        mySharePaise: shareRupees != null ? rupeesToPaise(shareRupees)! : 0,
        paidByMePaise: paidRupees != null ? rupeesToPaise(paidRupees)! : 0,
        payer,
      })
      if (!preview.ok) {
        setError(preview.error)
        return
      }
      shared = preview.shared
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
        shared,
      })
      remember()
      const oweNote = res.debt ? ` · You owe ${res.debt.person} ${formatPaise(res.debt.originalPaise)}` : ''
      onSaved?.(
        res.replayed
          ? 'Already recorded — showing the existing entry.'
          : `Recorded. ${walletLabel}: ${formatPaise(res.walletBalancePaise)}${oweNote}`,
      )
      resetShared()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const peopleOptions = people.data?.people ?? []

  return (
    <Modal open onClose={onClose} title="Add Expense" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="expense-item" className="mb-1 block text-xs text-muted">Item</label>
            <Input id="expense-item" placeholder="e.g. Bus ticket" value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div>
            <label htmlFor="expense-amount" className="mb-1 block text-xs text-muted">Amount ₹</label>
            <Input id="expense-amount" inputMode="decimal" placeholder="e.g. 30" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

        <div>
          <label htmlFor="expense-category" className="mb-1 block text-xs text-muted">Category</label>
          <Select id="expense-category" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
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
            <label htmlFor="expense-wallet" className="mb-1 block text-xs text-muted">Paid via</label>
            <Select id="expense-wallet" value={wallet} onChange={(e) => setWallet(e.target.value as WalletKey)}>
              <option value="cash">Cash</option>
              <option value="phonepe">PhonePe</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="expense-date" className="mb-1 block text-xs text-muted">Date</label>
            <Input id="expense-date" type="date" value={date} max={defaultDate} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Textarea rows={1} placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="self-end" />
        </div>

        {/* Shared payment — quiet progressive disclosure (off by default). */}
        <div>
          <button
            type="button"
            onClick={() => setSharedOpen((v) => !v)}
            aria-expanded={sharedOpen}
            className="min-h-[32px] text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {sharedOpen ? '− Hide shared payment' : '＋ Shared payment / someone else paid'}
          </button>

          {sharedOpen && (
            <div className="anim-rise mt-2 space-y-3 rounded-xl border border-line bg-surface-2/40 p-3">
              <div>
                <div className="mb-1 text-xs text-muted">Payment arrangement</div>
                <div className="flex gap-1.5" role="group" aria-label="Payment arrangement">
                  {ARRANGEMENTS.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setMode(a.value)}
                      aria-pressed={mode === a.value}
                      className={`min-h-[36px] flex-1 rounded-md border px-2 text-xs font-medium transition-colors ${
                        mode === a.value ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode !== 'me' && (
                <>
                  <div>
                    <label htmlFor="expense-my-share" className="mb-1 block text-xs text-muted">
                      My share ₹ {mode === 'someone_else' && <span className="font-normal">(the full amount)</span>}
                    </label>
                    {mode === 'someone_else' ? (
                      <div className="rounded-lg border border-line bg-surface/70 px-3 py-2 text-sm text-muted">
                        {amountPaise != null ? formatPaise(amountPaise) : '—'}
                      </div>
                    ) : (
                      <Input
                        id="expense-my-share"
                        inputMode="decimal"
                        placeholder="e.g. 3000"
                        value={myShare}
                        onChange={(e) => setMyShare(e.target.value)}
                      />
                    )}
                  </div>

                  {mode === 'split' && (
                    <div>
                      <label htmlFor="expense-paid-by-me" className="mb-1 block text-xs text-muted">I paid ₹</label>
                      <Input
                        id="expense-paid-by-me"
                        inputMode="decimal"
                        placeholder="e.g. 1500"
                        value={paidByMe}
                        onChange={(e) => setPaidByMe(e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="expense-payer" className="mb-1 block text-xs text-muted">Paid by (person)</label>
                    <Input
                      id="expense-payer"
                      placeholder="e.g. Balaji"
                      value={payer}
                      onChange={(e) => setPayer(e.target.value)}
                      maxLength={40}
                      list="debt-people-options"
                    />
                    <datalist id="debt-people-options">
                      {peopleOptions.map((p) => (
                        <option key={p.person} value={p.person} />
                      ))}
                    </datalist>
                  </div>

                  {/* Live preview — pure helper output; the server re-validates. */}
                  {sharedPreview &&
                    (sharedPreview.ok ? (
                      sharedPreview.debtPaise > 0 ? (
                        <div className="rounded-md bg-accent/10 px-3 py-2 text-xs text-muted">
                          My share <span className="font-medium text-ink">{formatPaise(sharedPreview.shared.mySharePaise)}</span>
                          {' · '}I paid <span className="font-medium text-ink">{formatPaise(sharedPreview.shared.paidByMePaise ?? 0)}</span>
                          {' — '}You owe{' '}
                          <span className="font-semibold text-accent">{formatPaise(sharedPreview.debtPaise)}</span> to{' '}
                          <span className="font-medium text-ink">{sharedPreview.payer}</span>
                        </div>
                      ) : (
                        <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                          Fully paid by you — no debt will be created.
                        </div>
                      )
                    ) : (
                      <div className="rounded-md bg-warn/10 px-3 py-2 text-xs font-medium text-warn">{sharedPreview.error}</div>
                    ))}
                </>
              )}

              {mode === 'me' && (
                <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  You paid it yourself — saved as a normal expense, no debt.
                </div>
              )}
            </div>
          )}
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
