import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } })
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        fields: err.flatten().fieldErrors,
      },
    })
    return
  }

  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record for this date already exists' } })
    return
  }

  if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'CastError') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid identifier' } })
    return
  }

  console.error('[error]', err)
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } })
}