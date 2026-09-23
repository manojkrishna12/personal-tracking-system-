import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { useCountUp } from '../lib/motion'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'accent' }) {
  const styles =
    variant === 'primary'
      ? 'bg-ink text-bg hover:opacity-85'
      : variant === 'accent'
        ? 'btn-gradient hover:opacity-95'
        : variant === 'danger'
          ? 'bg-bad/10 text-bad hover:bg-bad/20'
          : 'bg-transparent border border-line text-ink hover:bg-surface-2'
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props} />
}

export function IconButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`inline-flex items-center justify-center rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-sm text-ink backdrop-blur transition-colors hover:bg-surface-2 disabled:opacity-40 ${className}`} {...props} />
}

/** Glass card — the shared premium surface. `interactive` adds hover lift. */
export function Card({ className = '', children, interactive = false }: { className?: string; children: ReactNode; interactive?: boolean }) {
  return (
    <div
      className={`card-glass rounded-2xl border border-line p-4 backdrop-blur-sm sm:p-5 ${
        interactive ? 'transition-all duration-200 hover:-translate-y-0.5 hover:border-muted/40 hover:shadow-[var(--card-shadow-hover)]' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</h2>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-lg border border-line bg-surface/70 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-lg border border-line bg-surface/70 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded-lg border border-line bg-surface/70 px-3 py-2 text-sm text-ink ${props.className ?? ''}`} />
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    good: 'bg-good/10 text-good',
    warn: 'bg-warn/10 text-warn',
    bad: 'bg-bad/10 text-bad',
    accent: 'bg-accent/10 text-accent',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
}

/**
 * SVG progress ring. Draws in from 0 on mount and re-draws smoothly when the
 * value changes (via the .ring-anim transition); the % label counts alongside.
 * Pure SVG/CSS — no dependencies, respects reduced motion.
 */
export function ProgressRing({ value, size = 72, stroke = 7, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  // Mount one frame later so the dashoffset transition draws from 0.
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') {
      setDrawn(true)
      return
    }
    const raf = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  const shown = drawn ? clamped : 0
  const displayPct = useCountUp(shown, 900)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (shown / 100) * c}
          className="ring-anim"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--good)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-ink">{displayPct}%</span>
        {label ? <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span> : null}
      </div>
    </div>
  )
}

/** Card header row: small caps title + optional action on the right. */
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</div>
      {action}
    </div>
  )
}

/**
 * Count-up presentation of a numeric value (e.g. ₹ amounts in paise).
 * Purely visual: `value` is always the real API-derived number — only the
 * rendered text animates toward it. With animateOnMount=false the first
 * render shows the exact value (no artificial 0→N on page load); later
 * changes animate from the previous value. Respects reduced motion.
 */
export function AnimatedNumber({ value, format, animateOnMount = false, className = '' }: { value: number; format: (n: number) => string; animateOnMount?: boolean; className?: string }) {
  const display = useCountUp(value, 750, animateOnMount)
  return <span className={className}>{format(display)}</span>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className={`anim-rise relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-lg' : 'sm:max-w-sm'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted">{message}</p>
}

export function LoadingState() {
  return <div className="flex justify-center py-10 text-sm text-muted">Loading…</div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <p className="text-sm text-muted">{message}</p>
      {onRetry ? <Button variant="ghost" onClick={onRetry}>Retry</Button> : null}
    </div>
  )
}
