import { useState } from 'react'
import { Button, Modal, Textarea } from '../ui'
import type { HabitDef, HabitEntry } from '../../api/types'

interface Props {
  habit: HabitDef
  entry: HabitEntry | undefined
  saving: boolean
  onSave: (next: { habitKey: string; status?: 'completed' | 'not_completed'; details?: string; reason?: string }) => void
  onClose: () => void
}

export default function HabitModal({ habit, entry, saving, onSave, onClose }: Props) {
  const [status, setStatus] = useState<'completed' | 'not_completed'>(entry?.status ?? 'completed')
  const [details, setDetails] = useState(entry?.details ?? '')
  const [reason, setReason] = useState(entry?.reason ?? '')

  const isCompleted = status === 'completed'

  function handleSave() {
    onSave({
      habitKey: habit.key,
      status,
      ...(isCompleted ? { details: details.trim() || undefined } : { reason: reason.trim() || undefined }),
    })
  }

  return (
    <Modal open onClose={onClose} title={habit.label}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setStatus('completed')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${isCompleted ? 'border-good/60 bg-good/10 text-good' : 'border-line text-muted hover:bg-surface-2'}`}
          >
            ✓ Completed
          </button>
          <button
            onClick={() => setStatus('not_completed')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${!isCompleted ? 'border-warn/60 bg-warn/10 text-warn' : 'border-line text-muted hover:bg-surface-2'}`}
          >
            ✗ Not completed
          </button>
        </div>

        {isCompleted ? (
          <div>
            <label className="mb-1 block text-xs text-muted">Details (optional)</label>
            <Textarea
              rows={3}
              placeholder={habit.key === 'protein' ? 'e.g. 6 eggs + paneer' : habit.key === 'study' ? 'e.g. DSA - 2 hours' : habit.key === 'gym' ? 'e.g. Chest + shoulders' : 'What did you do?'}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted">Reason (optional)</label>
            <Textarea rows={3} placeholder="Why not?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}