import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import DayView from './pages/DayView'
import Login from './pages/Login'
import Monthly from './pages/Monthly'
import Register from './pages/Register'
import Settings from './pages/Settings'
import Weekly from './pages/Weekly'
import Weight from './pages/Weight'
import Year from './pages/Year'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center py-16 text-sm text-muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <AppShell />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/day/:date" element={<DayView />} />
        <Route path="/insights/weekly" element={<Weekly />} />
        <Route path="/insights/monthly" element={<Monthly />} />
        <Route path="/insights/year" element={<Year />} />
        <Route path="/weight" element={<Weight />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}