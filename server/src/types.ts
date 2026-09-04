export type HabitStatus = 'completed' | 'not_completed'
export type HabitType = 'boolean' | 'purchase'
export type Direction = 'positive' | 'negative'
export type Quality = 'excellent' | 'average' | 'poor'

export interface HabitEntryInput {
  habitKey: string
  status?: HabitStatus
  details?: string
  reason?: string
}

export interface PurchaseInput {
  item: string
  amount: number
  category: string
  necessary: boolean
  notes?: string
}