import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Input } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-aurora flex min-h-screen items-center justify-center px-4">
      <Card className="anim-rise w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/manoj-logo.png" alt="Manoj signature logo" className="mb-4 h-16 w-16 rounded-full shadow-[0_0_28px_rgba(139,124,248,0.3)]" />
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">SelfTrack</div>
          <h1 className="text-lg font-semibold text-ink">Personal tracking & money</h1>
          <p className="mt-1 text-sm text-muted">Your private daily record.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <Button type="submit" variant="accent" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          No account?{' '}
          <Link to="/register" className="text-ink underline underline-offset-2">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  )
}
