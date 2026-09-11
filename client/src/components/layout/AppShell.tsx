import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useSaveSettings } from '../../hooks/useApi'
import { useFinanceOverview } from '../../hooks/useFinance'
import { AddExpenseModal } from '../money/AddExpenseModal'
import { AddMoneyModal } from '../money/AddMoneyModal'
import { formatPaise } from '../../lib/money'
import { todayInTz } from '../../lib/dates'
import type { WalletKey } from '../../api/types'

/* ---------------------------------- icons ---------------------------------- */

function Icon({ d, size = 17 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1M16 13h.01',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  reports: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 15h6M9 11h3',
  weight: 'M12 3a9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9Zm-2.5 6.5 2.5 3m2.5-3-2.5 3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z',
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
} as const

/* -------------------------------- theme toggle ------------------------------ */

function ThemeToggle({ onSaved }: { onSaved?: () => void }) {
  const { theme, toggleTheme } = useTheme()
  const saveSettings = useSaveSettings()
  const { user } = useAuth()

  return (
    <button
      onClick={() => {
        const next = theme === 'light' ? 'dark' : 'light'
        toggleTheme()
        if (user) {
          saveSettings.mutate({ ...user.settings, theme: next })
        }
        onSaved?.()
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface/50 text-muted transition-colors hover:text-ink"
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      <Icon d={theme === 'light' ? ICONS.moon : ICONS.sun} />
    </button>
  )
}

/* ---------------------------------- nav data -------------------------------- */

const NAV = [
  { to: '/', label: 'Calendar', icon: ICONS.calendar, end: true },
  { to: '/money', label: 'Money', icon: ICONS.wallet, end: true },
  { to: '/insights/weekly', label: 'Insights', icon: ICONS.insights, end: true },
  { to: '/reports', label: 'Reports', icon: ICONS.reports, end: true },
  { to: '/weight', label: 'Weight', icon: ICONS.weight, end: true },
  { to: '/settings', label: 'Settings', icon: ICONS.settings, end: true },
]

const MORE_NAV = NAV.filter((n) => ['/reports', '/weight', '/settings'].includes(n.to))

/* ---------------------------------- shell ----------------------------------- */

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const finance = useFinanceOverview()
  // fabOpen = chooser sheet; quickAdd = which finance modal is actually open.
  const [fabOpen, setFabOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState<null | 'money' | 'expense'>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const noWallets = !finance.data || finance.data.wallets.every((w) => !w.hasOpeningBalance)

  const balances: Record<WalletKey, number> = { cash: 0, phonepe: 0 }
  const thresholds: Record<WalletKey, number> = { cash: 0, phonepe: 0 }
  if (finance.data) {
    for (const w of finance.data.wallets) {
      balances[w.key] = w.balancePaise
      thresholds[w.key] = w.alertThresholdPaise
    }
  }
  const today = todayInTz(user?.settings.timezone)

  return (
    <div className="bg-aurora min-h-screen">
      {/* ------------------------------ Desktop sidebar ------------------------------ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-white/5 bg-[#0a0d14] px-4 py-6 lg:flex">
        <div className="mb-7 px-2">
          <img src="/manoj-logo.png" alt="Manoj signature logo" className="mx-auto mb-3 h-[68px] w-[68px] rounded-full shadow-[0_0_28px_rgba(139,124,248,0.28)]" />
          <div className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">SelfTrack</div>
          <div className="mt-0.5 text-center text-[11px] text-white/45">Personal tracking & money</div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[var(--accent)]/20 to-transparent font-medium text-white shadow-[inset_0_0_0_1px_rgba(139,124,248,0.25)]'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/90'
                }`
              }
            >
              <span className="text-white/60 transition-colors group-hover:text-white/90">
                <Icon d={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 border-t border-white/10 px-1 pt-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">
              {user?.name?.slice(0, 1).toUpperCase() ?? 'M'}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-white/85">{user?.name}</div>
              <div className="text-[10px] text-white/40">Track · Improve · Be better</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <button
              onClick={() => {
                logout().then(() => navigate('/login'))
              }}
              className="flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-[var(--bad)]"
            >
              <Icon d={ICONS.logout} size={14} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------ Mobile header ------------------------------ */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-[#0a0d14]/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/manoj-logo.png" alt="Manoj signature logo" className="h-8 w-8 shrink-0 rounded-full shadow-[0_0_16px_rgba(139,124,248,0.3)]" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">SelfTrack</div>
            <div className="text-[10px] text-white/45">Personal tracking & money</div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-56 lg:pb-10 lg:pt-8">
        <div className="anim-rise mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* ------------------------------ Mobile bottom nav ------------------------------ */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-white/5 bg-[#0a0d14]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] ${isActive ? 'font-semibold text-[var(--accent)]' : 'text-white/45'}`}
        >
          <Icon d={ICONS.home} /> Home
        </NavLink>
        <NavLink
          to="/money"
          end
          className={({ isActive }) => `flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] ${isActive ? 'font-semibold text-[var(--accent)]' : 'text-white/45'}`}
        >
          <Icon d={ICONS.wallet} /> Money
        </NavLink>

        {/* Center quick-add: opens the money/expense chooser sheet */}
        <button
          onClick={() => setFabOpen(true)}
          disabled={noWallets}
          className="btn-gradient -mt-6 flex h-13 w-13 items-center justify-center rounded-full p-3.5 transition-transform active:scale-95 disabled:opacity-40"
          aria-label="Quick add expense or money"
        >
          <Icon d={ICONS.plus} size={20} />
        </button>

        <NavLink
          to="/insights/weekly"
          end
          className={({ isActive }) => `flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] ${isActive ? 'font-semibold text-[var(--accent)]' : 'text-white/45'}`}
        >
          <Icon d={ICONS.insights} /> Insights
        </NavLink>

        <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] text-white/45">
          <Icon d={ICONS.more} /> More
        </button>
      </nav>

      {/* More sheet (Reports / Weight / Settings / sign out) */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="anim-rise absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-3 gap-3">
              {MORE_NAV.map((item) => (
                <button
                  key={item.to}
                  onClick={() => {
                    setMoreOpen(false)
                    navigate(item.to)
                  }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-2 py-4 text-xs text-ink active:scale-95"
                >
                  <Icon d={item.icon} />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="truncate text-xs text-muted">{user?.name}</span>
              <button
                onClick={() => {
                  logout().then(() => navigate('/login'))
                }}
                className="flex items-center gap-1.5 text-xs text-bad"
              >
                <Icon d={ICONS.logout} size={14} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add action chooser (from the FAB) */}
      {fabOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setFabOpen(false)} />
          <div className="anim-rise absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="mb-4 text-center text-sm font-semibold text-ink">
              {finance.data ? formatPaise(finance.data.totalBalancePaise) + ' available' : ''}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setFabOpen(false)
                  setQuickAdd('money')
                }}
                className="rounded-xl bg-good/15 px-3 py-4 text-sm font-semibold text-good active:scale-95"
              >
                + Add Money
              </button>
              <button
                onClick={() => {
                  setFabOpen(false)
                  setQuickAdd('expense')
                }}
                className="rounded-xl bg-bad/15 px-3 py-4 text-sm font-semibold text-bad active:scale-95"
              >
                + Add Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finance modals (opened from quick-add) */}
      {quickAdd === 'money' && <AddMoneyModal date={today} onClose={() => setQuickAdd(null)} />}
      {quickAdd === 'expense' && (
        <AddExpenseModal date={today} balances={balances} thresholds={thresholds} onClose={() => setQuickAdd(null)} />
      )}
    </div>
  )
}
