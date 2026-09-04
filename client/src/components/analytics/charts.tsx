import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState, SectionTitle } from '../ui'
import { formatINR } from '../../lib/format'

const axisStyle = { fontSize: 11, fill: 'var(--muted)' }

function ChartCard({ title, sub, children, height = 48 }: { title: string; sub?: string; children: React.ReactNode; height?: number }) {
  return (
    <Card>
      <SectionTitle sub={sub}>{title}</SectionTitle>
      <div style={{ height }}>{children}</div>
    </Card>
  )
}

export function ScoreTrendChart({ data }: { data: { date: string; score: number }[] }) {
  const rows = data.map((d) => ({ date: d.date.slice(5), score: d.score }))
  return (
    <ChartCard title="Daily score trend" sub="How the month is trending">
      {rows.length === 0 ? (
        <EmptyState message="No tracked days yet this month." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }} />
            <Line type="monotone" dataKey="score" stroke="var(--good)" strokeWidth={2} dot={{ r: 2.5, fill: 'var(--good)' }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

export function HabitConsistencyChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ChartCard title="Habit consistency" sub="Days each habit was completed">
      {data.length === 0 ? (
        <EmptyState message="No habits tracked this month." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={90} tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }} />
            <Bar dataKey="count" fill="var(--good)" radius={[0, 3, 3, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

export function PositiveVsNegative({ positive, negative }: { positive: number; negative: number }) {
  const data = [
    { name: 'Positive', value: positive, color: 'var(--good)' },
    { name: 'Negative', value: negative, color: 'var(--bad)' },
  ]
  return (
    <ChartCard title="Positive vs negative" sub="Completed positive vs negative habits">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
          <YAxis allowDecimals={false} tick={axisStyle} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={36}>
            {data.map((d) => (
              <Bar key={d.name} dataKey="value" fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function ProgressBar({ label, count, of, tone = 'good' }: { label: string; count: number; of: number; tone?: 'good' | 'warn' | 'bad' }) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0
  const color = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)'
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-xs text-muted">
          {count} / {of} days
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function PurchaseSummaryCard({ purchases, month }: { purchases: { total: number; count: number; topCategory: string | null; unnecessaryCount: number; unnecessaryAmount: number; unnecessaryShare: number }; month: string }) {
  return (
    <Card>
      <SectionTitle sub={month}>Spending</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={formatINR(purchases.total)} />
        <Stat label="Purchases" value={purchases.count} />
        <Stat label="Top category" value={purchases.topCategory ?? '—'} />
        <Stat label="Unnecessary" value={`${purchases.count > 0 ? Math.round((purchases.unnecessaryCount / purchases.count) * 100) : 0}%`} />
      </div>
      {purchases.unnecessaryAmount > 0 && (
        <div className="mt-3 text-xs text-muted">
          {formatINR(purchases.unnecessaryAmount)} spent on {purchases.unnecessaryCount} unnecessary purchase{purchases.unnecessaryCount === 1 ? '' : 's'}.
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-ink">{value}</div>
    </div>
  )
}