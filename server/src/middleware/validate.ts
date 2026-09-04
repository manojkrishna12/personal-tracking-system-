import type { Request, Response, NextFunction } from 'express'
import type { ZodTypeAny } from 'zod'

export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          fields: result.error.flatten().fieldErrors,
        },
      })
      return
    }
    req.body = result.data
    next()
  }
}