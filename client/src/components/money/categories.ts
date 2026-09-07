// Client mirror of the server finance registry (server/src/finance/registry.ts).

export interface CategoryDef {
  key: string
  label: string
  group: 'food' | 'transport' | 'shopping' | 'entertainment' | 'bills' | 'health' | 'education' | 'groceries' | 'other'
  order: number
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'home_food', label: 'Home Food', group: 'food', order: 0 },
  { key: 'outside_food', label: 'Outside Food', group: 'food', order: 1 },
  { key: 'fast_food', label: 'Fast Food', group: 'food', order: 2 },
  { key: 'snacks', label: 'Snacks', group: 'food', order: 3 },
  { key: 'drinks', label: 'Drinks', group: 'food', order: 4 },
  { key: 'groceries', label: 'Groceries', group: 'groceries', order: 5 },
  { key: 'transport', label: 'Transport', group: 'transport', order: 6 },
  { key: 'shopping', label: 'Shopping', group: 'shopping', order: 7 },
  { key: 'entertainment', label: 'Entertainment', group: 'entertainment', order: 8 },
  { key: 'bills', label: 'Bills', group: 'bills', order: 9 },
  { key: 'health', label: 'Health', group: 'health', order: 10 },
  { key: 'education', label: 'Education', group: 'education', order: 11 },
  { key: 'other', label: 'Other', group: 'other', order: 12 },
]

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export const NECESSITY_LABEL: Record<string, string> = {
  necessary: 'Necessary',
  optional: 'Optional',
  wasteful: 'Wasteful',
}
