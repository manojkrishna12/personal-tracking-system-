import { useMemo, useState } from 'react'
import { Button, Input, Modal, Select } from '../ui'
import { useFinanceOverview, useRepayDebt } from '../../hooks/useFinance'
import { formatPaise, parseAmountInput, rupeesToPaise } from '../../lib/money'
import { debtOutstandingPaise } from '../../lib/debts'
import type { Debt, WalletKey } from '../../api/types'

/**
 * Repay an outstanding debt: amount + wallet, with a live wallet-after
 * preview. The server stays authoritative (409 on over-repay / overdraft);
 * this preview just mirrors its rules so the user sees the outcome first.
 */
export function RepayDebtModal({ debt, onClose, onSaved }: { debt: Debt; onClose: () => void; onSaved?: (message: string) => void }) {
  const repay = useRepayDebt()
  const overview = useFinanceOverview()

  const outstanding = debtOutstandingPaise(debt)
  const [amount, setAmount] = useState((outstanding / 100).toFixed(2)) // default: full outstanding
  const [wallet, setWallet] = useState<WalletKey>('cash')
  const [error, setError] = useState('')

  const balances = useMemo(() => {
    const out: Record<WalletKey, number | null> = { cash: null, phonepe: null }
    for (const w of overview.data?.wallets ?? []) out[w.key] = w.balancePaise
    return out
  }, [overview.data])

  const parsedRupees = parseAmountInput(amount)
  const amountPaise = parsedRupees != null ? rupeesToPaise(parsedRupees) : null
  const remainingAfter = amountPaise != null ? Math.max(0, outstanding - amountPaise) : null
  const balance = balances[wallet]
  const walletAfter = balance != null && amountPaise != null ? balance - amountPaise : null

  const invalidAmount = amountPaise == null || amountPaise <= 0 || amountPaise > outstanding
  const insufficient = balance != null && amountPaise != null ? amountPaise > balance : false
  const canSubmit = !invalidAmount && !insufficient && !repay.isPending

  async function confirm() {
    if (amountPaise == null || invalidAmount || insufficient) return
    setError('')
    try {
      const res = await repay.mutateAsync({
        id: debt._id,
        amountPaise,
        walletKey: wallet,
        clientToken: crypto.randomUUID(),
      })
      const walletLabel = wallet === 'cash' ? 'Cash' : 'PhonePe'
      onSaved?.(
        res.replayed
          ? 'Already recorded — showing the existing repayment.'
          : res.settled
            ? `Debt to ${debt.person} fully repaid 🎉 ${walletLabel}: ${formatPaise(res.walletBalancePaise)}`
            : `Repaid ${formatPaise(amountPaise)} to ${debt.person} · ${walletLabel}: ${formatPaise(res.walletBalancePaise)}`,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record repayment')
    }
  }

  return (
    <Modal open onClose={onClose} title={`Repay ${debt.person}`}>
      <div className="space-y-3">
        {/* What is being repaid */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3">
          <div className="text-sm font-medium text-ink">{debt.item}</div>
          <div className="mt-0.5 text-xs text-muted">
            Outstanding <span className="font-semibold text-bad">{formatPaise(outstanding)}</span>
            {debt.repaidPaise > 0 && <> · already repaid {formatPaise(debt.repaidPaise)}</>}
          </div>
        </div>

        <div>
          <label htmlFor="repay-amount" className="mb-1 block text-xs text-muted">
            Amount to repay (₹)
          </label>
          <Input
            id="repay-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={(outstanding / 100).toFixed(2)}
            aria-describedby="repay-preview"
          />
          {amount !== (outstanding / 100).toFixed(2) && (
            <button
              type="button"
              onClick={() => setAmount((outstanding / 100).toFixed(2))}
              className="mt-1 text-xs text-[var(--accent)] hover:underline"
            >
              Repay full {formatPaise(outstanding)}
            </button>
          )}
        </div>

        <div>
          <label htmlFor="repay-wallet" className="mb-1 block text-xs text-muted">
            Pay from
          </label>
          <Select id="repay-wallet" value={wallet} onChange={(e) => setWallet(e.target.value as WalletKey)}>
            <option value="cash">Cash</option>
            <option value="phonepe">PhonePe</option>
          </Select>
        </div>

        {/* Live preview — mirrors the server's rules. */}
        <div id="repay-preview" className="rounded-xl border border-line bg-surface-2/40 p-3 text-xs">
          {invalidAmount ? (
            <span className="text-bad">
              {amountPaise != null && amountPaise > outstanding ? `Cannot exceed the outstanding ${formatPaise(outstanding)}` : 'Enter a valid amount'}
            </span>
          ) : insufficient ? (
            <span className="text-bad">{wallet === 'cash' ? 'Cash' : 'PhonePe'} balance too low{balance != null ? ` (${formatPaise(balance)})` : ''}</span>
          ) : (
            <div className="space-y-0.5 text-muted">
              <div>
                {remainingAfter === 0 ? (
                  <span className="font-medium text-good">Fully repays this debt</span>
                ) : (
                  <>Remaining after: <span className="font-medium text-ink">{formatPaise(remainingAfter ?? outstanding)}</span></>
                )}
              </div>
              <div>
                {wallet === 'cash' ? 'Cash' : 'PhonePe'} after repayment: <span className="font-medium text-ink">{walletAfter != null ? formatPaise(walletAfter) : '—'}</span>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-bad" role="alert">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={!canSubmit} className="flex-1">
            {repay.isPending ? 'Recording…' : remainingAfter === 0 && !invalidAmount ? 'Confirm — full repayment' : 'Confirm repayment'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
