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
  // Local development: the Vite proxy rewrites Host to the API target
  // (changeOrigin), so "localhost:5173" !== "127.0.0.1:3001". A loopback
  // Origin is our own dev frontend — allow it outside production. Production
  // (same-origin Vercel rewrite) is unaffected by this branch.
  if (!env.isProd && isLoopbackHost(originHost)) {
    next()
    return
  }
  res.status(403).json({ error: { code: 'BAD_ORIGIN', message: 'Cross-origin request not allowed' } })
}

function isLoopbackHost(hostWithPort: string): boolean {
  const hostname = hostWithPort.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
