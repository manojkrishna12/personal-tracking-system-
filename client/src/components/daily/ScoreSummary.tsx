import { qualityClass, qualityLabel } from '../../lib/quality'
import type { ScoreBreakdownItem } from '../../api/types'

interface Props {
  score: number | null
  quality: 'excellent' | 'average' | 'poor' | null
  breakdown: ScoreBreakdownItem[]
  preview: { score: number | null; quality: 'excellent' | 'average' | 'poor' | null; computed: boolean } | null
}

export default function ScoreSummary({ score, quality, breakdown, preview }: Props) {
  const showPreview = preview?.computed && preview.score !== score
  const display = showPreview ? preview!.score : score
  const displayQuality = showPreview ? preview!.quality : quality

  return (
    <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-semibold tracking-tight text-ink">{display ?? '—'}</div>
        <div className="text-sm text-muted">/ 100</div>
        <div className={`ml-auto text-sm font-medium ${qualityClass(displayQuality)}`}>
          {displayQuality ? qualityLabel(displayQuality) : 'No score yet'}
        </div>
      </div>

      {display == null ? (
        <p className="mt-1 text-xs text-muted">Record at least one habit to get a daily score.</p>
      ) : (
        <>
          {showPreview && <p className="mt-1 text-xs text-warn">Preview — saving will update from the server.</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {breakdown.map((b) => (
              <span key={b.habitKey} className="inline-flex items-center gap-1">
                <span>{b.label}</span>
                <span className={b.effect >= 0 ? 'text-good' : 'text-bad'}>
                  {b.effect >= 0 ? `+${b.effect}` : b.effect}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}