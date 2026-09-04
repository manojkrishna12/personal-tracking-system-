import { useEffect, useState } from 'react'
import { Button, Card, ErrorState, Input, LoadingState, SectionTitle, Select } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useHabits, useRecomputeScores, useSaveHabits, useSaveScoringConfig, useSaveSettings, useScoringConfig, useSettings } from '../hooks/useApi'
import type { HabitDef, ScoringConfig } from '../api/types'

const TIMEZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC']

function slugify(name: string): string {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('') || 'habit'
}

export default function Settings() {
  const { user } = useAuth()
  const settings = useSettings()
  const scoring = useScoringConfig()
  const habits = useHabits()

  const saveSettings = useSaveSettings()
  const saveScoring = useSaveScoringConfig()
  const saveHabits = useSaveHabits()
  const recompute = useRecomputeScores()

  const [goal, setGoal] = useState('')
  const [weekStart, setWeekStart] = useState<number>(1)
  const [timezone, setTimezone] = useState('Asia/Kolkata')

  const [baseline, setBaseline] = useState('60')
  const [excellent, setExcellent] = useState('75')
  const [average, setAverage] = useState('50')
  const [rows, setRows] = useState<ScoringConfig['habits']>([])

  const [habitRows, setHabitRows] = useState<HabitDef[]>([])
  const [newHabitName, setNewHabitName] = useState('')
  const [newHabitType, setNewHabitType] = useState<'boolean' | 'purchase'>('boolean')

  useEffect(() => {
    if (settings.data && goal === '') {
      setGoal(String(settings.data.settings.weightGoalKg))
      setWeekStart(settings.data.settings.weekStartsOn)
      setTimezone(settings.data.settings.timezone)
    }
  }, [settings.data, goal])

  useEffect(() => {
    if (scoring.data) {
      setBaseline(String(scoring.data.baseline))
      setExcellent(String(scoring.data.qualityThresholds.excellent))
      setAverage(String(scoring.data.qualityThresholds.average))
      setRows(scoring.data.habits)
    }
  }, [scoring.data])

  useEffect(() => {
    if (habits.data) setHabitRows(habits.data.habits)
  }, [habits.data])

  if (settings.isLoading || scoring.isLoading || habits.isLoading) return <LoadingState />
  if (settings.isError || scoring.isError || habits.isError) return <ErrorState message="Could not load settings." />

  const labels = Object.fromEntries(habitRows.map((h) => [h.key, h.label]))

  async function savePrefs() {
    const parsedGoal = Number(goal)
    if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) return
    await saveSettings.mutateAsync({
      weightGoalKg: parsedGoal,
      weekStartsOn: weekStart,
      timezone,
      theme: settings.data!.settings.theme,
    })
  }

  async function saveScoringPrefs() {
    await saveScoring.mutateAsync({
      baseline: Number(baseline) || 0,
      qualityThresholds: { excellent: Number(excellent) || 0, average: Number(average) || 0 },
      habits: rows.map((r) => ({ ...r, points: Number(r.points) || 0, cap: Number(r.cap) || 0 })),
    })
  }

  async function saveHabitPrefs() {
    await saveHabits.mutateAsync(
      habitRows.map((h) => ({
        key: h.key,
        label: h.label,
        type: h.type,
        order: h.order,
        weeklyGoal: { min: h.weeklyGoal.min, max: h.weeklyGoal.max },
      })),
    )
  }

  function addHabit() {
    const name = newHabitName.trim()
    if (!name) return
    let key = slugify(name)
    while (habitRows.some((h) => h.key === key)) key = `${key}2`
    setHabitRows([...habitRows, { key, label: name, order: habitRows.length, type: newHabitType, weeklyGoal: { min: null, max: null } }])
    setNewHabitName('')
  }

  const num = (v: string) => (v === '' ? null : Math.max(0, Math.min(7, Number(v) || 0)))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>

      <Card>
        <SectionTitle sub="Your private account">Profile</SectionTitle>
        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Name</span>
            <span className="font-medium text-ink">{user?.name ?? '—'}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Email</span>
            <span className="font-medium text-ink">{user?.email ?? '—'}</span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Used for goals, week boundaries and 'today'">Preferences</SectionTitle>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Weight goal (kg)</label>
              <Input type="number" step="0.1" value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Week starts on</label>
              <Select value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Timezone</label>
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={savePrefs} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? 'Saving…' : 'Save preferences'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="How your daily score is calculated. Changes re-stamp history.">Scoring</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Baseline</label>
              <Input type="number" min={0} max={100} value={baseline} onChange={(e) => setBaseline(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Excellent ≥</label>
              <Input type="number" min={0} max={100} value={excellent} onChange={(e) => setExcellent(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Average ≥</label>
              <Input type="number" min={0} max={100} value={average} onChange={(e) => setAverage(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="pb-2 pr-2 font-medium">Habit</th>
                  <th className="pb-2 pr-2 font-medium">Enabled</th>
                  <th className="pb-2 pr-2 font-medium">Direction</th>
                  <th className="pb-2 pr-2 font-medium">Points</th>
                  <th className="pb-2 font-medium">Max contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.habitKey}>
                    <td className="py-2 pr-2 text-ink">{labels[r.habitKey] ?? r.habitKey}</td>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={r.enabled} onChange={(e) => setRows(rows.map((x) => (x.habitKey === r.habitKey ? { ...x, enabled: e.target.checked } : x)))} />
                    </td>
                    <td className="py-2 pr-2">
                      <Select
                        value={r.direction}
                        onChange={(e) => setRows(rows.map((x) => (x.habitKey === r.habitKey ? { ...x, direction: e.target.value as 'positive' | 'negative' } : x)))}
                        className="!w-28 !py-1.5"
                      >
                        <option value="positive">Positive</option>
                        <option value="negative">Negative</option>
                      </Select>
                    </td>
                    <td className="py-2 pr-2">
                      <Input type="number" min={0} max={100} value={r.points} onChange={(e) => setRows(rows.map((x) => (x.habitKey === r.habitKey ? { ...x, points: Number(e.target.value) } : x)))} className="!w-20 !py-1.5" />
                    </td>
                    <td className="py-2">
                      <Input type="number" min={0} max={100} value={r.cap} onChange={(e) => setRows(rows.map((x) => (x.habitKey === r.habitKey ? { ...x, cap: Number(e.target.value) } : x)))} className="!w-20 !py-1.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {recompute.isSuccess && <span className="text-xs text-muted">Recomputed {recompute.data.recomputed} records.</span>}
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm('Recompute the score of every historical record with the current settings?')) recompute.mutate()
              }}
              disabled={recompute.isPending}
            >
              {recompute.isPending ? 'Recomputing…' : 'Recompute all scores'}
            </Button>
            <Button onClick={saveScoringPrefs} disabled={saveScoring.isPending}>
              {saveScoring.isPending ? 'Saving…' : 'Save scoring'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Weekly targets: minimum days for positive habits, maximum for negative ones. Blank = no goal.">Habits & weekly goals</SectionTitle>
        <div className="space-y-2">
          {habitRows.map((h) => (
            <div key={h.key} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2">
              <Input
                value={h.label}
                onChange={(e) => setHabitRows(habitRows.map((x) => (x.key === h.key ? { ...x, label: e.target.value } : x)))}
                className="!w-40 !py-1.5"
                maxLength={40}
              />
              <span className="text-xs text-muted">Min days</span>
              <Input
                type="number"
                min={0}
                max={7}
                placeholder="—"
                value={h.weeklyGoal.min ?? ''}
                onChange={(e) => setHabitRows(habitRows.map((x) => (x.key === h.key ? { ...x, weeklyGoal: { ...x.weeklyGoal, min: num(e.target.value) } } : x)))}
                className="!w-16 !py-1.5"
              />
              <span className="text-xs text-muted">Max days</span>
              <Input
                type="number"
                min={0}
                max={7}
                placeholder="—"
                value={h.weeklyGoal.max ?? ''}
                onChange={(e) => setHabitRows(habitRows.map((x) => (x.key === h.key ? { ...x, weeklyGoal: { ...x.weeklyGoal, max: num(e.target.value) } } : x)))}
                className="!w-16 !py-1.5"
              />
              <span className="ml-auto text-xs text-muted">{h.type}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <div className="w-48">
            <label className="mb-1 block text-xs text-muted">New habit</label>
            <Input placeholder="e.g. Sleep by 11pm" value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} maxLength={40} />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs text-muted">Type</label>
            <Select value={newHabitType} onChange={(e) => setNewHabitType(e.target.value as 'boolean' | 'purchase')}>
              <option value="boolean">Checklist</option>
              <option value="purchase">Purchases</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={addHabit}>
            Add habit
          </Button>
          <Button onClick={saveHabitPrefs} disabled={saveHabits.isPending} className="ml-auto">
            {saveHabits.isPending ? 'Saving…' : 'Save habits'}
          </Button>
        </div>
      </Card>
    </div>
  )
}