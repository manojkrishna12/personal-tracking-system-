// UI preferences in localStorage — deliberately limited to non-sensitive
// convenience values (plan §13D). NEVER store balances, transactions,
// tokens, or any financial data here; this module is the only sanctioned
// writer and its whitelist is covered by a test.

const KEY = 'selftrack.prefs.v1'

export interface UiPrefs {
  lastWallet?: 'cash' | 'phonepe'
  lastCategory?: string
  lastNecessity?: 'necessary' | 'optional' | 'wasteful'
}

const ALLOWED_KEYS: (keyof UiPrefs)[] = ['lastWallet', 'lastCategory', 'lastNecessity']

export function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: UiPrefs = {}
    for (const key of ALLOWED_KEYS) {
      const v = parsed[key]
      if (typeof v === 'string') out[key] = v as never
    }
    return out
  } catch {
    return {}
  }
}

export function savePrefs(patch: Partial<UiPrefs>): void {
  try {
    const next = { ...loadPrefs(), ...patch }
    const clean: Record<string, string> = {}
    for (const key of ALLOWED_KEYS) {
      const v = next[key]
      if (typeof v === 'string') clean[key] = v
    }
    localStorage.setItem(KEY, JSON.stringify(clean))
  } catch {
    // Private mode / storage disabled — preferences are best-effort only.
  }
}
