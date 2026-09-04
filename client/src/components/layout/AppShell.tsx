import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useSaveSettings } from '../../hooks/useApi'

const NAV = [
  { to: '/', label: 'Calendar', end: true },
  { to: '/insights/weekly', label: 'Weekly', end: true },
  { to: '/insights/monthly', label: 'Monthly', end: true },
  { to: '/insights/year', label: 'Year', end: true },
  { to: '/weight', label: 'Weight', end: true },
  { to: '/settings', label: 'Settings', end: true },
]

function ThemeToggle() {
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
      }}
      className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2"
      title="Toggle theme"
    >
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="mb-8 px-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Manoj</div>
          <div className="text-sm font-semibold text-ink">Tracking System</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 flex items-center justify-between gap-2 border-t border-line px-1 pt-4">
          <span className="truncate text-xs text-muted">{user?.name}</span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => {
                logout().then(() => navigate('/login'))
              }}
              className="text-xs text-muted hover:text-bad"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Manoj</div>
          <div className="text-sm font-semibold">Tracking System</div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => {
              logout().then(() => navigate('/login'))
            }}
            className="text-xs text-muted hover:text-bad"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="px-4 pb-24 pt-6 sm:px-6 lg:ml-52 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface lg:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-[11px] ${isActive ? 'font-semibold text-ink' : 'text-muted'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}