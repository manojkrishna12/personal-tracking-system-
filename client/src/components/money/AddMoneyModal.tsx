import { useState } from 'react'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import { loadPrefs, savePrefs } from '../../lib/prefs'
import { parseAmountInput, rupeesToPaise } from '../../lib/money'
import { useAddMoney } from '../../hooks/useFinance'
import type { WalletKey } from '../../api/types'

interface Props {
  date: string
  onClose: () => void
  onSaved?: (message: string) => void
}

/** Money received — every real transfer is a permanent ledger record (plan §8). */
export function AddMoneyModal({ date: defaultDate, onClose, onSaved }: Props) {
  const prefs = loadPrefs()
  const [amount, setAmount] = useState('')
  const [wallet, setWallet] = useState<WalletKey>(prefs.lastWallet ?? 'phonepe')
  const [source, setSource] = useState('Dad')
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const add = useAddMoney()

  async function submit() {
    const rupees = parseAmountInput(amount)
    if (rupees == null) {
      setError('Enter a valid amount (up to 2 decimals)')
      return
    }
    setError('')
    try {
      const res = await add.mutateAsync({
        amountPaise: rupeesToPaise(rupees)!,
        walletKey: wallet,
        source: source.trim() || 'Dad',
        date,
        note: note.trim() || undefined,
        clientToken: crypto.randomUUID(),
      })
      savePrefs({ lastWallet: wallet })
      onSaved?.(res.replayed ? 'Already recorded — showing the existing entry.' : `Added to ${wallet === 'cash' ? 'Cash' : 'PhonePe'}.`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <Modal open onClose={onClose} title="Add Money">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Records a real transfer into a wallet. It never overwrites your balance — it adds to it.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Amount ₹</label>
            <Input inputMode="decimal" placeholder="e.g. 700" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Wallet</label>
            <Select value={wallet} onChange={(e) => setWallet(e.target.value as WalletKey)}>
              <option value="cash">Cash</option>
              <option value="phonepe">PhonePe</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Source</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} placeholder="Dad" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Date</label>
            <Input type="date" value={date} max={defaultDate} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <Textarea rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error && <p className="text-xs text-bad">{error}</p>}
        <Button onClick={submit} disabled={add.isPending} className="w-full">
          {add.isPending ? 'Saving…' : 'Add money'}
        </Button>
      </div>
    </Modal>
  )
}
