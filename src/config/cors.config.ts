import { CorsOptions } from 'cors'
import { prisma } from '../lib/prisma.js'
import redis from './redis.config.js'

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:3001',
  'http://*.localhost:3000',
  'https://sandbox.sslcommerz.com',
  'https://www.biponiq.com',
  'https://*.biponiq.com',
  'https://biponiq.com',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

export const corsOptions: CorsOptions = {

  origin: async (origin, callback) => {
    // allow requests with no origin (mobile apps, curl, Postman) or 'null' origin (payment gateway redirects, iframes, etc.)
    if (!origin || origin === 'null') return callback(null, true)
    
    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (allowedOrigin.includes('*')) {
        // Convert wildcard pattern like 'https://*.biponiq.com' to regex '^https://.*\.biponiq\.com$'
        const regexPattern = allowedOrigin
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
        const regex = new RegExp(`^${regexPattern}$`)
        return regex.test(origin)
      }
      return allowedOrigin === origin
    })

    if (isAllowed) return callback(null, true)
    
    try {
      let host = origin;
      try {
        const url = new URL(origin);
        host = url.hostname;
      } catch (e) {
        // Fallback to origin if it can't be parsed
      }

      try {
        const cachedDomain = await redis.get(`cors:${host}`)
        if (cachedDomain) {
          return callback(null, true);
        }
      } catch (redisErr) {
        // If Redis fails, fall back to DB lookup
      }

      const customDomain = await prisma.customDomain.findUnique({
        where: { domain: host }
      });

      if (customDomain) {
        try {
          await redis.set(`cors:${host}`, 'true', 'EX', 3600) // Cache for 1 hour
        } catch (redisErr) {
          // Ignore Redis caching error
        }
        return callback(null, true);
      }
    } catch (error) {
      console.error("CORS custom domain DB check failed:", error);
    }
    
    return callback(new Error(`CORS: origin "${origin}" not allowed`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}
