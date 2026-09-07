import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState, SectionTitle } from '../ui'
import { formatPaise, paiseToRupees } from '../../lib/money'
import type { FinanceAnalytics } from '../../api/types'

const axisStyle = { fontSize: 11, fill: 'var(--muted)' }
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }

/** Money flow for a period — financially accurate lines, no "savings" (plan §15A). */
export function MoneyFlowSummary({ analytics, periodText }: { analytics: FinanceAnalytics; periodText: string }) {
  const f = analytics.moneyFlow
  if (!f) return null
  const rows: { label: string; value: string; tone?: 'good' | 'bad' | 'ink' }[] = [
    { label: 'Opening balance (brought forward)', value: formatPaise(f.openingPaise) },
    { label: 'Money received', value: `+${formatPaise(f.receivedPaise)}`, tone: 'good' },
    { label: 'Total available', value: formatPaise(f.availablePaise) },
    { label: 'Money spent', value: `−${formatPaise(f.expensesPaise)}`, tone: 'bad' },
    { label: 'Adjustments', value: `${f.adjustmentsPaise < 0 ? '−' : '+'}${formatPaise(Math.abs(f.adjustmentsPaise))}` },
    { label: 'Ending balance', value: formatPaise(f.endingPaise), tone: 'ink' },
  ]
  return (
    <Card>
      <SectionTitle sub={periodText}>Money flow</SectionTitle>
      <dl className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-muted">{r.label}</dt>
            <dd className={`font-medium ${r.tone === 'good' ? 'text-good' : r.tone === 'bad' ? 'text-bad' : r.tone === 'ink' ? 'text-ink' : 'text-ink'}`}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-muted">
        Ending balance is the calculated balance at the end of this period. Your current balance can be higher or lower if you tracked money
        after it — the two are never mixed.
      </p>
    </Card>
  )
}

export function DailySpendChart({ series }: { series: { date: string; spentPaise: number }[] }) {
  return (
    <Card>
      <SectionTitle sub="Spending per day">Daily spending</SectionTitle>
      {series.length === 0 ? (
        <EmptyState message="No spending recorded in this period." />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.map((d) => ({ date: d.date.slice(5), rupees: paiseToRupees(d.spentPaise) }))} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatPaise(Math.round(Number(v) * 100)), 'Spent']} />
              <Bar dataKey="rupees" fill="var(--good)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

export function CategorySpendChart({ byCategory }: { byCategory: FinanceAnalytics['byCategory'] }) {
  return (
    <Card>
      <SectionTitle sub="Where the money went">By category</SectionTitle>
      {byCategory.length === 0 ? (
        <EmptyState message="No spending recorded in this period." />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCategory.map((c) => ({ label: c.label, rupees: paiseToRupees(c.spentPaise) }))} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
              <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={92} tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatPaise(Math.round(Number(v) * 100)), 'Spent']} />
              <Bar dataKey="rupees" fill="var(--ink)" radius={[0, 3, 3, 0]} barSize={13} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
