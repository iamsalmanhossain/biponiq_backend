import type { Request } from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import status from 'http-status'

export const domainAvailabilityRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  keyGenerator: (req: Request) => {
    return `domain-availability:${req.user?.id ?? ipKeyGenerator(req.ip || '')}`
  },

  handler: (_req, res) => {
    res.status(status.TOO_MANY_REQUESTS).json({
      success: false,
      message: 'Too many domain searches. Please try again in a minute.',
    })
  },
})
