import { useState } from 'react'
import { Button, Input, Modal, Textarea } from '../ui'
import { formatPaise, parseAmountInput } from '../../lib/money'
import { useAdjustment } from '../../hooks/useFinance'
import type { WalletKey } from '../../api/types'

interface Props {
  walletKey: WalletKey
  walletLabel: string
  balancePaise: number
  date: string
  onClose: () => void
}

/**
 * Wallet reconciliation (plan §7B): the ledger is never overwritten — a
 * difference becomes a permanent balance_adjustment transaction with a
 * required reason, after an explicit confirmation step.
 */
export function ReconcileModal({ walletKey, walletLabel, balancePaise, date, onClose }: Props) {
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const adjust = useAdjustment()

  const countedRupees = counted.trim() === '' ? null : parseAmountInput(counted)
  const countedInvalid = counted.trim() !== '' && countedRupees == null
  const countedPaise = countedRupees != null ? countedRupees * 100 : null
  const differencePaise = countedPaise != null ? countedPaise - balancePaise : null
  const noDifference = differencePaise === 0

  async function save() {
    if (differencePaise == null || differencePaise === 0) return
    if (reason.trim().length < 3) {
      setError('A short reason is required (e.g. "Cash counted manually")')
      return
    }
    setError('')
    try {
      await adjust.mutateAsync({ walletKey, deltaPaise: differencePaise, reason: reason.trim(), date, clientToken: crypto.randomUUID() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the adjustment')
    }
  }

  return (
    <Modal open onClose={onClose} title={`Reconcile ${walletLabel}`}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          If the real {walletLabel.toLowerCase()} you have differs from the app's balance, record the difference as an adjustment. The
          ledger is never silently rewritten — the adjustment is kept as permanent history.
        </p>

        <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
          <div className="flex justify-between text-muted">
            <span>App balance</span>
            <span className="font-medium text-ink">{formatPaise(balancePaise)}</span>
          </div>
          <div className="mt-1 flex justify-between text-muted">
            <span>Actually counted</span>
            <span className="font-medium text-ink">{countedPaise != null ? formatPaise(countedPaise) : '—'}</span>
          </div>
          {differencePaise != null && (
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted">
              <span>Difference</span>
              <span className={`font-medium ${differencePaise === 0 ? 'text-ink' : differencePaise > 0 ? 'text-good' : 'text-bad'}`}>
                {differencePaise > 0 ? '+' : ''}
                {formatPaise(differencePaise)}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Counted amount ₹</label>
          <Input inputMode="decimal" placeholder="e.g. 2830" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {countedInvalid && <p className="mt-1 text-xs text-bad">Enter a valid amount</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Reason (required)</label>
          <Textarea rows={2} placeholder="Cash counted manually" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>

        {confirming && differencePaise != null && differencePaise !== 0 && (
          <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            {walletLabel} will change by <strong>{differencePaise > 0 ? '+' : ''}{formatPaise(differencePaise)}</strong> — from{' '}
            {formatPaise(balancePaise)} to {formatPaise(balancePaise + differencePaise)}. This is recorded as a permanent adjustment.
          </div>
        )}
        {error && <p className="text-xs text-bad">{error}</p>}

        <div className="flex gap-2">
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)} className="flex-1">
                Back
              </Button>
              <Button onClick={save} disabled={adjust.isPending} className="flex-1">
                {adjust.isPending ? 'Saving…' : 'Confirm adjustment'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => setConfirming(true)}
                disabled={differencePaise == null || noDifference || countedInvalid}
                className="flex-1"
              >
                Review difference
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
