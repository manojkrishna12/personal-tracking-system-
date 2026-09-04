import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HabitModal from './HabitModal'
import type { HabitDef } from '../../api/types'

const habit: HabitDef = {
  key: 'protein',
  label: 'Protein',
  order: 0,
  type: 'boolean',
  weeklyGoal: { min: 6, max: null },
}

describe('HabitModal', () => {
  it('saves completed status with details', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<HabitModal habit={habit} entry={undefined} saving={false} onSave={onSave} onClose={() => undefined} />)

    expect(screen.getByRole('heading', { name: 'Protein' })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('e.g. 6 eggs + paneer'), '6 eggs + paneer')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({ habitKey: 'protein', status: 'completed', details: '6 eggs + paneer' })
  })

  it('switches to Not Completed and saves an optional reason', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<HabitModal habit={{ ...habit, label: 'Junk Food', key: 'junkFood' }} entry={undefined} saving={false} onSave={onSave} onClose={() => undefined} />)

    await user.click(screen.getByRole('button', { name: '✗ Not completed' }))
    await user.type(screen.getByPlaceholderText('Why not?'), 'Had chips while watching TV')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({ habitKey: 'junkFood', status: 'not_completed', reason: 'Had chips while watching TV' })
  })

  it('cancel does not save', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<HabitModal habit={habit} entry={undefined} saving={false} onSave={onSave} onClose={() => undefined} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
  })
})