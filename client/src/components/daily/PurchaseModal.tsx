import { useState } from 'react'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import type { Purchase } from '../../api/types'
import { formatINR } from '../../lib/format'

const CATEGORIES = ['Electronics', 'Groceries', 'Food', 'Clothing', 'Health', 'Travel', 'Household', 'Other']

interface Props {
  purchases: Purchase[]
  saving: boolean
  onSave: (purchases: Purchase[]) => void
  onClose: () => void
}

export default function PurchaseModal({ purchases, saving, onSave, onClose }: Props) {
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0]!)
  const [necessary, setNecessary] = useState(true)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function add() {
    const parsed = Number(amount)
    if (!item.trim()) {
      setError('Item is required')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid amount')
      return
    }
    setError('')
    onSave([...purchases, { item: item.trim(), amount: parsed, category, necessary, notes: notes.trim() || undefined }])
    setItem('')
    setAmount('')
    setNotes('')
    setNecessary(true)
  }

  return (
    <Modal open onClose={onClose} title="Things Bought" wide>
      <div className="space-y-4">
        {purchases.length > 0 && (
          <ul className="space-y-1.5">
            {purchases.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{p.item}</span>
                  <span className="ml-2 text-xs text-muted">{p.category}</span>
                  {!p.necessary && <span className="ml-2 text-xs text-warn">unnecessary</span>}
                  {p.notes ? <div className="truncate text-xs text-muted">{p.notes}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-ink">{formatINR(p.amount)}</span>
                  <button onClick={() => onSave(purchases.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad" aria-label={`Remove ${p.item}`}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-md border border-line p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Add a purchase</div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Item" value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} />
            <Input placeholder="Amount ₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <div className="flex gap-2">
              <button
                onClick={() => setNecessary(true)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${necessary ? 'border-good/60 bg-good/10 text-good' : 'border-line text-muted'}`}
              >
                Necessary
              </button>
              <button
                onClick={() => setNecessary(false)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${!necessary ? 'border-warn/60 bg-warn/10 text-warn' : 'border-line text-muted'}`}
              >
                Unnecessary
              </button>
            </div>
          </div>
          <Textarea rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          {error ? <p className="text-xs text-bad">{error}</p> : null}
          <Button onClick={add} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Add purchase'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}