import { useState } from 'react'
import { Button, Card, Input } from '../ui'
import { formatPaise, parseAmountInput, rupeesToPaise } from '../../lib/money'
import { useFinanceOverview, useOpeningBalance } from '../../hooks/useFinance'
import type { WalletKey } from '../../api/types'

/**
 * Opening balances are the money the user has RIGHT NOW — never "money
 * received" (plan §7). Corrections show current → new → impact and require
 * explicit confirmation; the previous value is preserved in the audit trail
 * on the ledger transaction. Later real-world corrections should use the
 * Reconcile flow instead — this editor says so.
 */
export function OpeningBalanceEditor({ compact }: { compact?: boolean }) {
  const overview = useFinanceOverview()
  const save = useOpeningBalance()

  const wallets = overview.data?.wallets ?? []
  const needsSetup = wallets.length === 0 || wallets.every((w) => !w.hasOpeningBalance)

  const [values, setValues] = useState<Record<WalletKey, string>>({ cash: '', phonepe: '' })
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (overview.isLoading) return null

  // Parsed input per wallet: null = leave unchanged, NaN = invalid.
  const parseWallet = (key: WalletKey): number | null | typeof NaN => {
    const raw = values[key].trim()
    if (raw === '') return null
    const rupees = parseAmountInput(raw)
    return rupees != null ? rupeesToPaise(rupees) : NaN
  }

  const cashPaise = parseWallet('cash')
  const phonepePaise = parseWallet('phonepe')
  const hasInvalid = Number.isNaN(cashPaise) || Number.isNaN(phonepePaise)

  // Corrections are anchored to the OPENING AMOUNT (not the current balance).
  const changes: { key: WalletKey; label: string; opening: number | null; to: number }[] = []
  for (const key of ['cash', 'phonepe'] as WalletKey[]) {
    const parsed = key === 'cash' ? cashPaise : phonepePaise
    const w = wallets.find((x) => x.key === key)
    if (parsed != null && !Number.isNaN(parsed) && w) {
      changes.push({ key, label: key === 'cash' ? 'Cash' : 'PhonePe', opening: w.openingBalancePaise, to: parsed })
    }
  }

  async function submit() {
    setError('')
    try {
      for (const c of changes) {
        const isCorrection = c.opening != null && c.opening !== c.to
        await save.mutateAsync({
          walletKey: c.key,
          amountPaise: c.to,
          // A correction requires the acknowledged impact + echoed previous value.
          acknowledged: isCorrection ? true : undefined,
          previousAmountPaise: isCorrection ? c.opening! : undefined,
        })
      }
      setMessage('Opening balances saved.')
      setValues({ cash: '', phonepe: '' })
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <Card className={compact ? '' : 'border-dashed'}>
      <div className="text-sm font-semibold text-ink">{needsSetup ? 'Set up your money' : 'Opening balances'}</div>
      {needsSetup ? (
        <p className="mt-1 text-xs text-muted">
          Enter what you currently have. This is your starting balance — it is <strong>not</strong> recorded as money received from anyone.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Correcting an opening balance rewrites the ledger's foundation: review the impact and confirm. For later real-world corrections
          (counted cash doesn't match), prefer <strong>Reconcile</strong> — it keeps an adjustment in your history instead.
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(['cash', 'phonepe'] as WalletKey[]).map((key) => {
          const w = wallets.find((x) => x.key === key)
          return (
            <div key={key}>
              <label className="mb-1 block text-xs text-muted">
                {key === 'cash' ? 'Cash' : 'PhonePe'}
                {w?.hasOpeningBalance ? ` — opening ${formatPaise(w.openingBalancePaise!)}, now ${formatPaise(w.balancePaise)}` : ' ₹'}
              </label>
              <Input
                inputMode="decimal"
                placeholder={w?.hasOpeningBalance ? 'Leave blank to keep' : 'e.g. 3500'}
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            </div>
          )
        })}
      </div>

      {confirming && changes.length > 0 && (
        <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {changes.map((c) => {
            const from = c.opening ?? 0
            const delta = c.to - from
            return (
              <div key={c.key}>
                {c.label}: {formatPaise(from)} → <strong>{formatPaise(c.to)}</strong> ({delta >= 0 ? '+' : ''}
                {formatPaise(delta)})
              </div>
            )
          })}
          {changes.some((c) => c.opening != null && c.opening !== c.to) && (
            <div className="mt-1">The previous value(s) stay in the ledger's audit history.</div>
          )}
        </div>
      )}
      {message && <p className="mt-2 text-xs text-good">{message}</p>}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}

      {changes.length > 0 && !hasInvalid && (
        <div className="mt-3 flex gap-2">
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)} className="flex-1">
                Back
              </Button>
              <Button onClick={submit} disabled={save.isPending} className="flex-1">
                {save.isPending ? 'Saving…' : 'Confirm opening balances'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirming(true)} className="flex-1">
              Review changes
            </Button>
          )}
        </div>
      )}
      {hasInvalid && <p className="mt-2 text-xs text-bad">Enter valid amounts (up to 2 decimals, not negative).</p>}
    </Card>
  )
}
