import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'

/**
 * CSRF guard for state-changing requests (plan §19).
 *
 * With the same-origin Vercel rewrite the Origin header equals the host, so
 * this never fires. If the API is ever called cross-origin directly
 * (COOKIE_SAMESITE=none), only the configured CLIENT_ORIGIN is allowed.
 * Requests without an Origin header (curl, server-to-server) pass through —
 * they cannot carry browser credentials implicitly.
 */
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next()
    return
  }
  const origin = req.headers.origin
  if (!origin) {
    next()
    return
  }
  let originHost = ''
  try {
    originHost = new URL(String(origin)).host
  } catch {
    res.status(403).json({ error: { code: 'BAD_ORIGIN', message: 'Invalid origin' } })
    return
  }
  const forwardedHost = req.headers['x-forwarded-host']
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? req.headers.host
  if (originHost === host || String(origin) === env.clientOrigin) {
    next()
    return
  }
  res.status(403).json({ error: { code: 'BAD_ORIGIN', message: 'Cross-origin request not allowed' } })
}
