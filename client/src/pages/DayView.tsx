import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import DayNav from '../components/daily/DayNav'
import HabitModal from '../components/daily/HabitModal'
import PurchaseModal from '../components/daily/PurchaseModal'
import ScoreSummary from '../components/daily/ScoreSummary'
import { Button, ErrorState, Input, LoadingState } from '../components/ui'
import { useDay, useHabits, useSaveDay, useSaveWeight, useScoringConfig, useWeight } from '../hooks/useApi'
import { addDaysStr, isValidDateString, todayInTz } from '../lib/dates'
import { previewScore } from '../lib/scoringPreview'
import { formatINR } from '../lib/format'
import type { DayRecord, HabitEntry, Purchase } from '../api/types'

interface Draft {
  habits: HabitEntry[]
  purchases: Purchase[]
}

export default function DayView() {
  const { date = '' } = useParams()
  const valid = isValidDateString(date)

  const habitsQuery = useHabits()
  const scoringQuery = useScoringConfig()
  const dayQuery = useDay(valid ? date : '2000-01-01')
  const saveDayMutation = useSaveDay(valid ? date : '2000-01-01')
  const weightQuery = useWeight(500)
  const saveWeightMutation = useSaveWeight()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [habitModal, setHabitModal] = useState<string | null>(null)
  const [purchaseModal, setPurchaseModal] = useState(false)
  const [weightForm, setWeightForm] = useState(false)
  const [weightValue, setWeightValue] = useState('')
  const [weightNote, setWeightNote] = useState('')

  // Reset local draft when navigating to another date.
  useEffect(() => {
    setDraft(null)
    setHabitModal(null)
    setPurchaseModal(false)
    setWeightForm(false)
  }, [date])

  useEffect(() => {
    if (dayQuery.data && draft === null) {
      setDraft({ habits: dayQuery.data.habits, purchases: dayQuery.data.purchases })
    }
  }, [dayQuery.data, draft])

  if (!valid) return <Navigate to="/" replace />
  if (habitsQuery.isLoading || scoringQuery.isLoading || dayQuery.isLoading || weightQuery.isLoading) return <LoadingState />
  if (habitsQuery.isError || dayQuery.isError || scoringQuery.isError) return <ErrorState message="Could not load this day." />

  const habits = habitsQuery.data!.habits
  const habitDefs = [...habits].sort((a, b) => a.order - b.order)
  const labels = Object.fromEntries(habits.map((h) => [h.key, h.label]))
  const saved = dayQuery.data!
  const record: DayRecord = draft ? { ...saved, habits: draft.habits, purchases: draft.purchases } : saved

  const preview = scoringQuery.data
    ? previewScore(
        scoringQuery.data,
        record.habits,
        record.purchases,
      )
    : null

  const today = todayInTz()
  const isFuture = date > today

  const entryFor = (key: string) => record.habits.find((h) => h.habitKey === key)
  const weightForDate = weightQuery.data?.entries.find((e) => e.date === date)

  async function persist(nextDraft: Draft) {
    try {
      const result = await saveDayMutation.mutateAsync({
        habits: nextDraft.habits.map((h) => ({
          habitKey: h.habitKey,
          status: h.status,
          details: h.details ?? undefined,
          reason: h.reason ?? undefined,
        })),
        purchases: nextDraft.purchases,
      })
      setDraft({ habits: result.habits, purchases: result.purchases })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save')
    }
  }

  function saveHabit(next: { habitKey: string; status?: 'completed' | 'not_completed'; details?: string; reason?: string }) {
    const others = record.habits.filter((h) => h.habitKey !== next.habitKey)
    const nextDraft: Draft = {
      ...record,
      habits: next.status ? [...others, { habitKey: next.habitKey, status: next.status, details: next.details ?? null, reason: next.reason ?? null }] : others,
    }
    setHabitModal(null)
    void persist(nextDraft)
  }

  function savePurchases(purchases: Purchase[]) {
    void persist({ ...record, purchases })
  }

  function clearDay() {
    if (!window.confirm(`Clear all entries for ${date}?`)) return
    void persist({ habits: [], purchases: [] })
  }

  async function saveWeightForDay() {
    const kg = Number(weightValue)
    if (!Number.isFinite(kg) || kg <= 0) return
    try {
      await saveWeightMutation.mutateAsync({ date, body: { weightKg: kg, note: weightNote.trim() || undefined } })
      setWeightForm(false)
      setWeightValue('')
      setWeightNote('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save weight')
    }
  }

  const activeHabitModal = habitModal ? habitDefs.find((h) => h.key === habitModal) ?? null : null
  const thingsBought = habitDefs.find((h) => h.key === 'thingsBought')
  const totalSpent = record.purchases.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-5">
      <DayNav date={date} />

      {isFuture && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-muted">
          This date is in the future — it can't be recorded yet.
        </div>
      )}

      <ScoreSummary score={saved.score} quality={saved.quality} breakdown={saved.scoreBreakdown} preview={preview} />

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Habits
        </div>
        <ul className="divide-y divide-line">
          {habitDefs
            .filter((h) => h.key !== 'thingsBought')
            .map((h) => {
              const entry = entryFor(h.key)
              return (
                <li key={h.key}>
                  <button
                    onClick={() => setHabitModal(h.key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60 disabled:opacity-50"
                    disabled={isFuture}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                        entry?.status === 'completed'
                          ? 'border-good/60 bg-good/10 text-good'
                          : entry?.status === 'not_completed'
                            ? 'border-warn/60 bg-warn/10 text-warn'
                            : 'border-line text-muted'
                      }`}
                    >
                      {entry?.status === 'completed' ? '✓' : entry?.status === 'not_completed' ? '✗' : '·'}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink">{h.label}</span>
                      {entry?.details ? (
                        <span className="block text-xs text-muted">{entry.details}</span>
                      ) : entry?.reason ? (
                        <span className="block text-xs text-muted">{entry.reason}</span>
                      ) : null}
                    </span>
                    {entry?.status === 'not_completed' && <span className="text-[10px] uppercase tracking-wider text-muted">Not completed</span>}
                  </button>
                </li>
              )
            })}

          {/* Things Bought */}
          {thingsBought && (
            <li>
              <button
                onClick={() => setPurchaseModal(true)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60 disabled:opacity-50"
                disabled={isFuture}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${record.purchases.length > 0 ? 'border-good/60 bg-good/10 text-good' : 'border-line text-muted'}`}>
                  {record.purchases.length > 0 ? '✓' : '·'}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{thingsBought.label}</span>
                  {record.purchases.length > 0 ? (
                    <span className="block text-xs text-muted">
                      {record.purchases.length} purchase{record.purchases.length === 1 ? '' : 's'} · {formatINR(totalSpent)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )}
        </ul>
      </div>

      {/* Weight for this day */}
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Weight</div>
          {!weightForm && (
            <button onClick={() => setWeightForm(true)} className="text-xs text-muted hover:text-ink" disabled={isFuture}>
              {weightForDate ? 'Update' : 'Record'}
            </button>
          )}
        </div>
        {weightForDate ? (
          <div className="mt-2 text-sm text-ink">
            {weightForDate.weightKg.toFixed(1)} kg
            {weightForDate.note ? <span className="ml-2 text-xs text-muted">{weightForDate.note}</span> : null}
          </div>
        ) : (
          !weightForm && <div className="mt-2 text-sm text-muted">No weight recorded for this day.</div>
        )}
        {weightForm && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Input placeholder="kg" inputMode="decimal" value={weightValue} onChange={(e) => setWeightValue(e.target.value)} />
            </div>
            <div className="flex-1">
              <Input placeholder="Note (optional)" value={weightNote} onChange={(e) => setWeightNote(e.target.value)} maxLength={300} />
            </div>
            <Button onClick={saveWeightForDay} disabled={saveWeightMutation.isPending}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setWeightForm(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted">
          {saveDayMutation.isPending ? 'Saving…' : saved.score != null ? 'Saved' : ''}
        </span>
        <button onClick={clearDay} className="text-xs text-muted hover:text-bad">
          Clear day
        </button>
      </div>

      {activeHabitModal && (
        <HabitModal
          habit={activeHabitModal}
          entry={entryFor(activeHabitModal.key)}
          saving={saveDayMutation.isPending}
          onSave={saveHabit}
          onClose={() => setHabitModal(null)}
        />
      )}
      {purchaseModal && (
        <PurchaseModal purchases={record.purchases} saving={saveDayMutation.isPending} onSave={savePurchases} onClose={() => setPurchaseModal(false)} />
      )}
    </div>
  )
}