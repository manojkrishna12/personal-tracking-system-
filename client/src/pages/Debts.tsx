import { Card, ErrorState, LoadingState, SectionTitle } from '../components/ui'
import { useDebts, useDebtsSummary } from '../hooks/useFinance'
import { formatPaise } from '../lib/money'
import { debtOutstandingPaise } from '../lib/debts'
import { categoryLabel } from '../components/money/categories'
import type { Debt } from '../api/types'

// Read-only view of obligations created by shared expenses (Phase 4). All
// numbers come verbatim from the debts API — nothing is derived or invented
// here. Repayment arrives in Phase 5; this page changes nothing.

function DebtRow({ debt }: { debt: Debt }) {
  const remaining = debtOutstandingPaise(debt)
  const repaid = Math.min(debt.repaidPaise, debt.originalPaise)
  const pct = debt.originalPaise > 0 ? Math.round((repaid / debt.originalPaise) * 100) : 0
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3 transition-colors hover:border-muted/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-ink">{debt.item}</span>
        <span className="text-sm font-semibold text-bad">{formatPaise(remaining)}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
        <span>
          {categoryLabel(debt.categoryKey ?? 'other')} · {debt.date}
        </span>
        <span>
          Original {formatPaise(debt.originalPaise)}
          {repaid > 0 && <> · Repaid {formatPaise(repaid)}</>}
        </span>
      </div>
      {/* Repaid progress bar — flat at 0% until repayment ships (Phase 5). */}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2" role="presentation">
        <div className="h-full rounded-full bg-good/70 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Debts — "who do I owe, how much, and why". Grouped per person via the
 * backend's case-insensitive rollup; each person card lists their individual
 * outstanding entries. Read-only in this phase.
 */
export function Debts() {
  const summary = useDebtsSummary()
  const outstanding = useDebts({ status: 'outstanding' })

  const loading = summary.isLoading || outstanding.isLoading
  const error = summary.isError || outstanding.isError

  if (loading) return <LoadingState />
  if (error)
    return (
      <ErrorState
        message="Could not load your debts."
        onRetry={() => {
          void summary.refetch()
          void outstanding.refetch()
        }}
      />
    )

  const s = summary.data!
  const byPersonKey = new Map<string, Debt[]>()
  for (const d of outstanding.data?.debts ?? []) {
    const key = d.person.toLowerCase()
    const list = byPersonKey.get(key) ?? []
    list.push(d)
    byPersonKey.set(key, list)
  }
  // Display name = the summary's (most recent casing) for that person.
  const displayName = new Map(s.people.map((p) => [p.person.toLowerCase(), p.person]))

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">Debts</h1>
        <span className="text-xs text-muted">What you owe others — from shared expenses</span>
      </div>

      {/* Total outstanding — the headline number. */}
      <Card interactive className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Total you owe</div>
        <div className="mt-1 text-3xl font-bold text-ink">{formatPaise(s.totalOutstandingPaise)}</div>
        <div className="mt-1 text-xs text-muted">
          {s.outstandingCount === 0
            ? 'Nothing outstanding right now.'
            : `Across ${s.people.length} ${s.people.length === 1 ? 'person' : 'people'} · ${s.outstandingCount} ${s.outstandingCount === 1 ? 'debt' : 'debts'}`}
        </div>
      </Card>

      {s.outstandingCount === 0 ? (
        <Card>
          <div className="py-6 text-center">
            <div className="text-2xl" aria-hidden="true">🎉</div>
            <p className="mt-2 text-sm font-medium text-ink">No outstanding debts</p>
            <p className="mt-1 text-xs text-muted">Shared expenses you owe will appear here.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {s.people.map((p) => {
            const key = p.person.toLowerCase()
            const debts = byPersonKey.get(key) ?? []
            return (
              <Card key={key} interactive>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{displayName.get(key) ?? p.person}</div>
                    <div className="text-xs text-muted">
                      {debts.length === 1 ? '1 debt' : `${debts.length} debts`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-bad">{formatPaise(p.outstandingPaise)}</div>
                    <div className="text-[11px] text-muted">outstanding</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {debts.map((d) => (
                    <DebtRow key={d._id} debt={d} />
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
