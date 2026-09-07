// Finance registries — wallets and expense categories are code constants for
// V1 (see the approved plan §5). Adding a wallet or category later means
// adding one entry here; nothing needs seeding or migrating.

export interface WalletDef {
  key: 'cash' | 'phonepe'
  label: string
  order: number
}

export const WALLETS: WalletDef[] = [
  { key: 'cash', label: 'Cash', order: 0 },
  { key: 'phonepe', label: 'PhonePe', order: 1 },
]

export const WALLET_KEYS = WALLETS.map((w) => w.key)

export function isWalletKey(key: unknown): key is WalletDef['key'] {
  return typeof key === 'string' && (WALLET_KEYS as string[]).includes(key)
}

export function walletLabel(key: string): string {
  return WALLETS.find((w) => w.key === key)?.label ?? key
}

export interface CategoryDef {
  key: string
  label: string
  group: 'food' | 'transport' | 'shopping' | 'entertainment' | 'bills' | 'health' | 'education' | 'groceries' | 'other'
  order: number
}

// The food group powers the food report: every category with group 'food'
// is summed into it, with a per-category breakdown.
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

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)

export function isCategoryKey(key: unknown): key is string {
  return typeof key === 'string' && (CATEGORY_KEYS as string[]).includes(key)
}

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export function categoryGroup(key: string): CategoryDef['group'] | null {
  return CATEGORIES.find((c) => c.key === key)?.group ?? null
}
