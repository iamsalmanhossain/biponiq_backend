import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import z from 'zod'

export const validateSchema = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body)

      if (!result.success) {
        return next(result.error)
      }
      req.body = result.data
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params)

      if (!result.success) {
        return next(result.error)
      }
      req.params = result.data as Record<string, string>
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query)

      if (!result.success) {
        return next(result.error)
      }

      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      })

      next()
    } catch (error) {
      next(error)
    }
  }
}

