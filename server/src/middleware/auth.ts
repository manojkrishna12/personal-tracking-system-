import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface AuthUser {
  id: string
  email: string
}

export interface AuthRequest extends Request {
  user?: AuthUser
}

export function authRequired(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined
  if (!token) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' } })
    return
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub?: string; email?: string }
    if (!payload.sub) throw new Error('missing subject')
    req.user = { id: payload.sub, email: payload.email ?? '' }
    next()
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Session expired, please log in again' } })
  }
}

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function setAuthCookie(res: Response, userId: string, email: string): void {
  const token = jwt.sign({ email }, env.jwtSecret, { subject: userId, expiresIn: '30d' })
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.isProd,
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  })
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: env.isProd, path: '/' })
}