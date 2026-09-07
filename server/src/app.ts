import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import { env } from './config/env'
import { authRequired } from './middleware/auth'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import daysRoutes from './routes/days'
import habitsRoutes from './routes/habits'
import weightRoutes from './routes/weight'
import settingsRoutes from './routes/settings'
import insightsRoutes from './routes/insights'
import exportRoutes from './routes/export'
import financeRoutes from './routes/finance'
import { originCheck } from './middleware/originCheck'

export function createApp() {
  const app = express()

  // Helmet's strict CSP is fine for the built app but blocks Vite dev/HMR.
  app.use(helmet({ contentSecurityPolicy: env.isProd ? undefined : false }))
  // Allow the deployed frontend (a different origin) to call this API with cookies.
  // Unset locally — the Vite dev proxy is same-origin, so no CORS headers are added.
  if (env.clientOrigin) {
    app.use(cors({ origin: env.clientOrigin, credentials: true }))
  }
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  // CSRF guard for state-changing requests (plan §19) — a no-op under the
  // same-origin Vercel rewrite, protective for direct cross-origin modes.
  app.use(originCheck)

  // Liveness probe for the host (Render health check).
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  // Rate limiters are skipped in the test environment — the integration
  // suite shares one IP and would exhaust them within a few tests.
  const makeLimiter = (limit: number) =>
    env.nodeEnv === 'test'
      ? (_req: unknown, _res: unknown, next: () => void) => next()
      : rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false })
  const authLimiter = makeLimiter(20)
  // Generous but bounded — covers reads and all finance mutations.
  const financeLimiter = makeLimiter(300)

  app.use('/api/auth', authLimiter, authRoutes)
  app.use('/api/days', authRequired, daysRoutes)
  app.use('/api/habits', authRequired, habitsRoutes)
  app.use('/api/weight', authRequired, weightRoutes)
  app.use('/api/settings', authRequired, settingsRoutes)
  app.use('/api/insights', authRequired, insightsRoutes)
  app.use('/api/export', authRequired, exportRoutes)
  // Finance reads and mutations are rate-limited (plan §18).
  app.use('/api/finance', financeLimiter, authRequired, financeRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}