export type Quality = 'excellent' | 'average' | 'poor' | null

export const QUALITY_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  average: 'Average',
  poor: 'Poor',
}

export const QUALITY_COLOR: Record<string, string> = {
  excellent: 'var(--good)',
  average: 'var(--warn)',
  poor: 'var(--bad)',
}

export const QUALITY_SOFT: Record<string, string> = {
  excellent: 'var(--good-soft)',
  average: 'var(--warn-soft)',
  poor: 'var(--bad-soft)',
}

export function qualityLabel(q: Quality): string {
  return q ? QUALITY_LABEL[q] ?? q : ''
}

export function qualityColor(q: Quality): string {
  return q ? QUALITY_COLOR[q] ?? 'var(--muted)' : 'var(--muted)'
}

export function qualityClass(q: Quality): string {
  if (q === 'excellent') return 'text-good'
  if (q === 'average') return 'text-warn'
  if (q === 'poor') return 'text-bad'
  return 'text-muted'
}