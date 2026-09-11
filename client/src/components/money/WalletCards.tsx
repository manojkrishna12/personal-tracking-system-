import { formatPaise } from '../../lib/money'
import type { FinanceOverview, WalletOverview } from '../../api/types'
import { Button, Card } from '../ui'

function WalletIcon({ wallet }: { wallet: WalletOverview }) {
  if (wallet.key === 'cash') {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-good/15 text-good" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1M16 13h.01" />
        </svg>
      </span>
    )
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent" aria-hidden="true">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="20" rx="2.5" />
        <path d="M11 18h2" />
      </svg>
    </span>
  )
}

function WalletCard({ wallet, onReconcile }: { wallet: WalletOverview; onReconcile: (w: WalletOverview) => void }) {
  return (
    <Card interactive>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <WalletIcon wallet={wallet} />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{wallet.label}</div>
            <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{formatPaise(wallet.balancePaise)}</div>
          </div>
        </div>
        <button onClick={() => onReconcile(wallet)} className="text-[11px] text-muted transition-colors hover:text-ink" title={`Reconcile ${wallet.label}`}>
          Reconcile
        </button>
      </div>
      {!wallet.hasOpeningBalance && <div className="mt-1 text-[11px] text-muted">No opening balance set yet.</div>}
      {wallet.low && wallet.hasOpeningBalance && (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-warn">
          <span aria-hidden="true">⚠</span> Low — below your threshold of {formatPaise(wallet.alertThresholdPaise)}.
        </div>
      )}
    </Card>
  )
}

interface Props {
  overview: FinanceOverview
  onAddMoney: () => void
  onAddExpense: () => void
  onReconcile: (w: WalletOverview) => void
}

/** MY MONEY header — balances, quick actions, spend strip (plan §13B/§14). */
export function MoneyOverview({ overview, onAddMoney, onAddExpense, onReconcile }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {overview.wallets.map((w) => (
          <WalletCard key={w.key} wallet={w} onReconcile={onReconcile} />
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Total available</div>
            <div className="text-2xl font-bold tracking-tight text-ink">{formatPaise(overview.totalBalancePaise)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onAddMoney}>
              + Add Money
            </Button>
            <Button variant="accent" onClick={onAddExpense}>+ Add Expense</Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Today</div>
            <div className="text-sm font-medium text-ink">{formatPaise(overview.spent.todayPaise)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">This week</div>
            <div className="text-sm font-medium text-ink">{formatPaise(overview.spent.weekPaise)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">This month</div>
            <div className="text-sm font-medium text-ink">{formatPaise(overview.spent.monthPaise)}</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
