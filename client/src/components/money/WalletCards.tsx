import { formatPaise } from '../../lib/money'
import type { FinanceOverview, WalletOverview } from '../../api/types'
import { Button, Card } from '../ui'

function WalletCard({ wallet, onReconcile }: { wallet: WalletOverview; onReconcile: (w: WalletOverview) => void }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{wallet.label}</div>
        <button onClick={() => onReconcile(wallet)} className="text-[11px] text-muted hover:text-ink" title={`Reconcile ${wallet.label}`}>
          Reconcile
        </button>
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">{formatPaise(wallet.balancePaise)}</div>
      {!wallet.hasOpeningBalance && <div className="mt-1 text-[11px] text-muted">No opening balance set yet.</div>}
      {wallet.low && wallet.hasOpeningBalance && (
        <div className="mt-1 text-[11px] font-medium text-warn">
          Low — below your threshold of {formatPaise(wallet.alertThresholdPaise)}.
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
            <div className="text-xl font-semibold text-ink">{formatPaise(overview.totalBalancePaise)}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onAddMoney}>
              + Add Money
            </Button>
            <Button onClick={onAddExpense}>+ Add Expense</Button>
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
