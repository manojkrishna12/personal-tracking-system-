import { useMemo, useState, type FormEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, SectionTitle } from '../components/ui'
import { useDeleteWeight, useSaveSettings, useSaveWeight, useSettings, useWeight } from '../hooks/useApi'
import { shortDateLabel, todayInTz } from '../lib/dates'
import { formatKg } from '../lib/format'

const axisStyle = { fontSize: 11, fill: 'var(--muted)' }

export default function Weight() {
  const weight = useWeight(500)
  const settings = useSettings()
  const saveWeight = useSaveWeight()
  const deleteWeight = useDeleteWeight()
  const saveSettings = useSaveSettings()

  const [date, setDate] = useState(() => todayInTz())
  const [kg, setKg] = useState('')
  const [note, setNote] = useState('')
  const [goal, setGoal] = useState('')

  const entries = useMemo(() => [...(weight.data?.entries ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)), [weight.data])

  if (weight.isLoading || settings.isLoading) return <LoadingState />
  if (weight.isError || settings.isError) return <ErrorState message="Could not load weight data." />

  const userSettings = settings.data!.settings
  const goalKg = goal !== '' ? Number(goal) : userSettings.weightGoalKg
  const latest = entries.length > 0 ? entries[entries.length - 1]! : null
  const first = entries[0] ?? null
  const remaining = latest ? Math.max(0, latest.weightKg - goalKg) : null
  const progress = latest && first && latest.weightKg > goalKg && first.weightKg > goalKg ? Math.max(0, Math.min(100, Math.round(((first.weightKg - latest.weightKg) / (first.weightKg - goalKg)) * 100))) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = Number(kg)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    try {
      await saveWeight.mutateAsync({ date, body: { weightKg: parsed, note: note.trim() || undefined } })
      setKg('')
      setNote('')
    } catch {
      /* handled by alert-free inline? keep simple */
    }
  }

  async function saveGoal() {
    const parsed = Number(goal)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    await saveSettings.mutateAsync({ ...userSettings, weightGoalKg: parsed })
    setGoal('')
  }

  const chartData = entries.map((e) => ({ date: shortDateLabel(e.date), kg: e.weightKg }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Weight</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-muted">Current</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{latest ? formatKg(latest.weightKg) : '—'}</div>
          {latest?.note ? <div className="mt-1 text-xs text-muted">{latest.note}</div> : null}
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-muted">Goal</div>
          <div className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink">
            {formatKg(goalKg)}
            <button onClick={() => setGoal(String(userSettings.weightGoalKg))} className="text-xs font-normal text-muted hover:text-ink">
              Edit
            </button>
          </div>
          {goal !== '' && (
            <div className="mt-2 flex items-center gap-2">
              <Input type="number" step="0.1" value={goal} onChange={(e) => setGoal(e.target.value)} className="!w-24" />
              <Button onClick={saveGoal} disabled={saveSettings.isPending}>Save</Button>
            </div>
          )}
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-muted">Remaining</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{remaining != null ? formatKg(remaining) : '—'}</div>
          {progress != null && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-good" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted">{progress}% of the way to your goal</div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle sub="Only entries you explicitly record">Trend</SectionTitle>
        {chartData.length < 2 ? (
          <EmptyState message="Record at least two measurements to see a trend." />
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }} />
                <Line type="monotone" dataKey="kg" stroke="var(--good)" strokeWidth={2} dot={{ r: 3, fill: 'var(--good)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Record a measurement</SectionTitle>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="w-28">
            <Input placeholder="Weight kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} required />
          </div>
          <div className="min-w-40 flex-1">
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
          <Button type="submit" disabled={saveWeight.isPending}>
            {saveWeight.isPending ? 'Saving…' : 'Record'}
          </Button>
        </form>
      </Card>

      <Card>
        <SectionTitle>History</SectionTitle>
        {entries.length === 0 ? (
          <EmptyState message="No weight entries yet." />
        ) : (
          <ul className="divide-y divide-line">
            {[...entries].reverse().map((e) => (
              <li key={e.date} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <span className="text-sm font-medium text-ink">{formatKg(e.weightKg)}</span>
                  <span className="ml-2 text-xs text-muted">{e.date}</span>
                  {e.note ? <span className="ml-2 text-xs text-muted">{e.note}</span> : null}
                </div>
                <button onClick={() => deleteWeight.mutate(e.date)} className="text-xs text-muted hover:text-bad">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}