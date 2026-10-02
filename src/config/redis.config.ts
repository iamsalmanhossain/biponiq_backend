import { Redis } from 'ioredis'

let redisInstance: Redis | null = null

const getRedis = (): Redis => {
  if (!redisInstance) {
    redisInstance = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // BullMQ requires this
      enableReadyCheck: false,    // Prevents connection errors on startup
    })

    redisInstance.on('connect', () => {
      console.log('[Redis] Successfully connected')
    })

    redisInstance.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })
  }

  return redisInstance
}

const redis = getRedis()

export { getRedis }
export default redis
