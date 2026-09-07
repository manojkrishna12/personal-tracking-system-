import { useMemo, useState } from 'react'
import { Card, EmptyState, ErrorState, LoadingState, SectionTitle } from '../components/ui'
import { PeriodSelector, rangeLabel } from '../components/money/PeriodSelector'
import { DailySpendChart, CategorySpendChart, MoneyFlowSummary } from '../components/money/FinanceCharts'
import { useDadReport, useFinanceAnalytics } from '../hooks/useFinance'
import { todayInTz } from '../lib/dates'
import { resolvePeriod, type PeriodName, type PeriodRange } from '../lib/periods'
import { formatPaise } from '../lib/money'
import type { Necessity } from '../api/types'

const TABS = [
  { key: 'overview', label: 'Where it went' },
  { key: 'dad', label: 'Dad money' },
  { key: 'food', label: 'Food' },
  { key: 'wasteful', label: 'Wasteful' },
  { key: 'trends', label: 'Trends' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function Reports() {
  const today = todayInTz()
  const [tab, setTab] = useState<TabKey>('overview')
  const [period, setPeriod] = useState<PeriodName>('this_month')
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today })

  const range: PeriodRange = useMemo(
    () => (period === 'custom' ? { from: custom.from || null, to: custom.to || null } : resolvePeriod(period, today, 1)),
    [period, custom, today],
  )
  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (range.from) p.set('from', range.from)
    if (range.to) p.set('to', range.to)
    const qs = p.toString()
    return qs ? `?${qs}` : ''
  }, [range])

  const analytics = useFinanceAnalytics(query)
  const dad = useDadReport(query, tab === 'dad')

  const periodText = rangeLabel(period, range)

  if (analytics.isLoading) return <LoadingState />
  if (analytics.isError || !analytics.data) return <ErrorState message="Could not load reports." onRetry={() => analytics.refetch()} />
  const d = analytics.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">Money reports</h1>
        <PeriodSelector period={period} custom={custom} onPeriod={setPeriod} onCustom={(c) => setCustom({ from: c.from || today, to: c.to || today })} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-t-md px-3 py-1.5 text-sm ${tab === t.key ? 'border-x border-t border-line bg-surface font-medium text-ink' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <MoneyFlowSummary analytics={d} periodText={periodText} />
          <Card>
            <SectionTitle sub={periodText}>Where did my money go?</SectionTitle>
            {d.byCategory.length === 0 ? (
              <EmptyState message="No spending recorded in this period." />
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {d.byCategory.map((c) => (
                    <tr key={c.key}>
                      <td className="py-1.5 text-ink">{c.label}</td>
                      <td className="py-1.5 text-right text-muted">{c.count}×</td>
                      <td className="py-1.5 text-right font-medium text-ink">{formatPaise(c.spentPaise)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-2 font-semibold text-ink" colSpan={2}>
                      Total spent
                    </td>
                    <td className="pt-2 text-right font-semibold text-ink">{formatPaise(d.totals.spentPaise)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted">
              You received {formatPaise(d.totals.receivedPaise)} and spent {formatPaise(d.totals.spentPaise)} {periodText}
              {d.totals.adjustmentsPaise !== 0
                ? `, with ${formatPaise(Math.abs(d.totals.adjustmentsPaise))} of balance adjustments`
                : ''}
              .
            </p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-[11px] uppercase tracking-wider text-muted">Money received</div>
              <div className="mt-1 text-lg font-semibold text-good">{formatPaise(d.totals.receivedPaise)}</div>
              <div className="text-[11px] text-muted">{d.counts.receivedTransactions} transfer(s)</div>
            </Card>
            <Card>
              <div className="text-[11px] uppercase tracking-wider text-muted">Money spent</div>
              <div className="mt-1 text-lg font-semibold text-ink">{formatPaise(d.totals.spentPaise)}</div>
              <div className="text-[11px] text-muted">{d.counts.expenses} expense(s)</div>
            </Card>
            <Card>
              <div className="text-[11px] uppercase tracking-wider text-muted">Largest expense</div>
              <div className="mt-1 text-lg font-semibold text-ink">{d.largestExpense ? formatPaise(d.largestExpense.amountPaise) : '—'}</div>
              <div className="truncate text-[11px] text-muted">{d.largestExpense?.item ?? 'None'}</div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'dad' && (
        <div className="space-y-4">
          {dad.isError && <ErrorState message="Could not load the report." onRetry={() => dad.refetch()} />}
          {dad.isLoading && <LoadingState />}
          {dad.data && (
            <>
              <Card>
                <SectionTitle sub={`${dad.data.source} · ${periodText}`}>Money received</SectionTitle>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Total</div>
                    <div className="mt-0.5 text-xl font-semibold text-ink">{formatPaise(dad.data.totalPaise)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Transfers</div>
                    <div className="mt-0.5 text-xl font-semibold text-ink">{dad.data.count}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Average</div>
                    <div className="mt-0.5 text-xl font-semibold text-ink">{formatPaise(dad.data.averagePaise)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Split</div>
                    <div className="mt-0.5 text-sm font-medium text-ink">
                      Cash {formatPaise(dad.data.byWallet.cashPaise)} · PhonePe {formatPaise(dad.data.byWallet.phonepePaise)}
                    </div>
                  </div>
                </div>
                {dad.data.count === 0 && <EmptyState message={`No money received from ${dad.data.source} in this period.`} />}
              </Card>
              {dad.data.transactions.length > 0 && (
                <Card>
                  <SectionTitle sub="Chronological">History</SectionTitle>
                  <ul className="divide-y divide-line text-sm">
                    {dad.data.transactions.map((t) => (
                      <li key={t._id} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="text-muted">{t.date}</span>
                        <span className="text-ink">
                          {t.walletKey === 'cash' ? 'Cash' : 'PhonePe'} · <span className="font-medium text-good">+{formatPaise(t.amountPaise)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <p className="px-1 text-xs text-muted">
                {dad.data.currentBalanceDisclaimer} Current available balance: {formatPaise(dad.data.currentBalancePaise)}.
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'food' && (
        <div className="space-y-4">
          <Card>
            <SectionTitle sub={periodText}>Food spending</SectionTitle>
            {d.food.count === 0 ? (
              <EmptyState message="No food spending recorded in this period." />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Total food</div>
                    <div className="mt-0.5 text-lg font-semibold text-ink">{formatPaise(d.food.totalPaise)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Purchases</div>
                    <div className="mt-0.5 text-lg font-semibold text-ink">{d.food.count}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Wasteful</div>
                    <div className="mt-0.5 text-lg font-semibold text-bad">{formatPaise(d.food.wastefulPaise)}</div>
                  </div>
                </div>
                <table className="mt-4 w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {d.food.byCategory.map((c) => (
                      <tr key={c.key}>
                        <td className="py-1.5 text-ink">{c.label}</td>
                        <td className="py-1.5 text-right text-muted">{c.count}×</td>
                        <td className="py-1.5 text-right font-medium text-ink">{formatPaise(c.spentPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>
          <CategorySpendChart byCategory={d.food.byCategory.map((c) => ({ ...c, spentPaise: c.spentPaise }))} />
        </div>
      )}

      {tab === 'wasteful' && (
        <Card>
          <SectionTitle sub={periodText}>Where am I wasting money?</SectionTitle>
          {d.byNecessity.wastefulCount === 0 ? (
            <EmptyState message="No purchases marked wasteful in this period." />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Potential wasteful spending: <span className="font-semibold text-bad">{formatPaise(d.byNecessity.wastefulPaise)}</span> across{' '}
                {d.byNecessity.wastefulCount} purchase(s).
              </p>
              <ul className="divide-y divide-line text-sm">
                {d.byCategory
                  .filter((c) => c.key === 'fast_food' || c.key === 'drinks' || c.key === 'snacks' || c.key === 'outside_food' || c.key === 'shopping' || c.key === 'entertainment')
                  .map((c) => (
                    <li key={c.key} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="text-ink">{c.label}</span>
                      <span className="text-muted">{c.count}×</span>
                      <span className="font-medium text-ink">{formatPaise(c.spentPaise)}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Based entirely on your own Necessary / Optional / Wasteful labels — no advice, no judgement.
              </p>
            </>
          )}
        </Card>
      )}

      {tab === 'trends' && (
        <div className="space-y-4">
          <DailySpendChart series={d.dailySeries} />
          <CategorySpendChart byCategory={d.byCategory} />
          <Card>
            <SectionTitle sub={periodText}>Necessity split</SectionTitle>
            <div className="grid grid-cols-3 gap-3 text-center">
              {(['necessary', 'optional', 'wasteful'] as Necessity[]).map((n) => (
                <div key={n} className="rounded-md bg-surface-2 px-2 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted">{n}</div>
                  <div className="mt-0.5 text-base font-semibold text-ink">
                    {formatPaise(d.byNecessity[`${n}Paise` as 'necessaryPaise' | 'optionalPaise' | 'wastefulPaise'])}
                  </div>
                  <div className="text-[11px] text-muted">{d.byNecessity[`${n}Count` as 'necessaryCount' | 'optionalCount' | 'wastefulCount']}×</div>
                </div>
              ))}
            </div>
            {d.prevComparison && d.prevComparison.changePct != null && (
              <p className="mt-3 text-xs text-muted">
                Spending {d.prevComparison.changePct >= 0 ? 'increased' : 'decreased'} {Math.abs(d.prevComparison.changePct)}% compared with
                the previous period ({formatPaise(d.prevComparison.prevSpentPaise)}).
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
