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

  // Liveness probe for the host (Render health check).
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.use('/api/auth', authLimiter, authRoutes)
  app.use('/api/days', authRequired, daysRoutes)
  app.use('/api/habits', authRequired, habitsRoutes)
  app.use('/api/weight', authRequired, weightRoutes)
  app.use('/api/settings', authRequired, settingsRoutes)
  app.use('/api/insights', authRequired, insightsRoutes)
  app.use('/api/export', authRequired, exportRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}