import { prisma } from '../../lib/prisma.js'
import redis from '../../config/redis.config.js'

type VisitorQuotaReservationInput = {
  vendorId: string
  subscriptionId: string
  visitorLimit: number
  persistedUsage: number
  subscriptionCreatedAt: Date
}

export type VisitorQuotaReservationResult =
  | 'ALLOWED'
  | 'ALLOWED_AND_REACHED'
  | 'QUOTA_REACHED'
  | 'QUOTA_RECOVERY'
  | 'REDIS_UNAVAILABLE'

const QUOTA_KEY_PREFIX = 'visitor_quota'
const RECOVERY_KEY_PREFIX = 'visitor_quota_recovery'
const RECOVERY_LOCK_TTL_SECONDS = 30
const RECOVERY_POLL_MS = 500
const REDIS_OPERATION_TIMEOUT_MS = 2_000

const RESERVE_QUOTA_LUA = `
local current = redis.call('GET', KEYS[1])
local persistedUsage = tonumber(ARGV[1]) or 0
local visitorLimit = tonumber(ARGV[2]) or 0
local mayInitialize = ARGV[3] == '1'

if not current then
  if not mayInitialize then
    redis.call('SET', KEYS[1], visitorLimit)
    return 0
  end

  current = persistedUsage
else
  current = tonumber(current)
  if not current then
    return 0
  end
  if persistedUsage > current then
    current = persistedUsage
  end
end

if current >= visitorLimit then
  redis.call('SET', KEYS[1], current)
  return 0
end

redis.call('SET', KEYS[1], current + 1)
if current + 1 >= visitorLimit then
  return 2
end
return 1
`

const RECONCILE_QUOTA_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then
  return false
end

current = tonumber(current)
if not current then
  return false
end

local persistedUsage = tonumber(ARGV[1]) or 0
if persistedUsage > current then
  current = persistedUsage
  redis.call('SET', KEYS[1], current)
end

return current
`

const RENEW_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
`

class RedisRecoveryRunIdChangedError extends Error {
  constructor() {
    super('Redis run_id changed during visitor quota recovery')
  }
}

let quotaRecoveryReady = false
let recoveryPromise: Promise<void> | null = null
let recoveryPromiseRunId: string | null = null
let listenersRegistered = false
let currentRunId: string | null = null
let recoveryBoundary: Date | null = null

const quotaKey = (vendorId: string, subscriptionId: string) =>
  `${QUOTA_KEY_PREFIX}:${vendorId}:${subscriptionId}`

const recoveryLockKey = (runId: string) => `${RECOVERY_KEY_PREFIX}:lock:${runId}`
const recoveryDoneKey = (runId: string) => `${RECOVERY_KEY_PREFIX}:done:${runId}`
const recoveryBoundaryKey = (runId: string) => `${RECOVERY_KEY_PREFIX}:boundary:${runId}`

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const withRedisTimeout = async <T>(operation: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Visitor quota Redis operation timed out')), REDIS_OPERATION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const getRedisRunId = async (): Promise<string> => {
  const info = await redis.info('server')
  const runIdLine = info.split('\n').find((line) => line.startsWith('run_id:'))
  const runId = runIdLine?.slice('run_id:'.length).trim()

  if (!runId) {
    throw new Error('Redis INFO server did not provide run_id')
  }

  return runId
}

const assertRedisRunId = async (expectedRunId: string) => {
  if ((await getRedisRunId()) !== expectedRunId) {
    throw new RedisRecoveryRunIdChangedError()
  }
}

const getDatabaseRecoveryBoundary = async (): Promise<Date> => {
  const rows = await prisma.$queryRaw<Array<{ boundary: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "boundary"
  `
  const boundary = rows[0]?.boundary

  if (!(boundary instanceof Date) || Number.isNaN(boundary.getTime())) {
    throw new Error('PostgreSQL did not provide a valid recovery boundary')
  }

  return boundary
}

const parseQuotaKey = (key: string): { vendorId: string; subscriptionId: string } | null => {
  const match = /^visitor_quota:([^:]+):([^:]+)$/.exec(key)
  if (!match?.[1] || !match[2]) return null

  return { vendorId: match[1], subscriptionId: match[2] }
}

const reconcileQuotaKey = async (key: string) => {
  const parsed = parseQuotaKey(key)
  if (!parsed) return

  const subscription = await prisma.vendorSubscription.findUnique({
    where: { id: parsed.subscriptionId },
    select: {
      vendorId: true,
      startDate: true,
    },
  })

  if (!subscription || subscription.vendorId !== parsed.vendorId || !subscription.startDate) return

  const persistedUsage = await prisma.visitorTracking.count({
    where: {
      vendorId: parsed.vendorId,
      createdAt: { gte: subscription.startDate },
    },
  })

  await redis.eval(RECONCILE_QUOTA_LUA, 1, key, String(persistedUsage))
}

const reconcileRestoredQuotaKeys = async () => {
  let cursor = '0'

  do {
    const scanResult = await redis.scan(cursor, 'MATCH', `${QUOTA_KEY_PREFIX}:*`, 'COUNT', '100')
    cursor = scanResult[0] ?? '0'
    const keys = scanResult[1] ?? []

    for (const key of keys) {
      await reconcileQuotaKey(key)
    }
  } while (cursor !== '0')
}

const loadRecoveryBoundary = async (runId: string): Promise<Date | null> => {
  const value = await redis.get(recoveryBoundaryKey(runId))
  if (!value) return null

  const boundary = new Date(value)
  return Number.isNaN(boundary.getTime()) ? null : boundary
}

const markLocalRecoveryComplete = (runId: string, boundary: Date) => {
  currentRunId = runId
  recoveryBoundary = boundary
  quotaRecoveryReady = true
}

const runRecoveryAsWinner = async (runId: string, lockValue: string) => {
  const lockKey = recoveryLockKey(runId)
  const renewalTimer = setInterval(() => {
    void redis
      .eval(RENEW_LOCK_LUA, 1, lockKey, lockValue, String(RECOVERY_LOCK_TTL_SECONDS))
      .catch(() => undefined)
  }, (RECOVERY_LOCK_TTL_SECONDS * 1000) / 2)

  try {
    let boundary = await loadRecoveryBoundary(runId)
    if (!boundary) {
      const databaseBoundary = await getDatabaseRecoveryBoundary()
      await redis.set(recoveryBoundaryKey(runId), databaseBoundary.toISOString(), 'NX')
      boundary = (await loadRecoveryBoundary(runId)) ?? databaseBoundary
    }

    await reconcileRestoredQuotaKeys()
    await assertRedisRunId(runId)
    await redis.set(recoveryDoneKey(runId), '1')
    await assertRedisRunId(runId)
    markLocalRecoveryComplete(runId, boundary)
  } finally {
    clearInterval(renewalTimer)
    await redis.eval(RENEW_LOCK_LUA, 1, lockKey, lockValue, '0').catch(() => undefined)
  }
}

const waitForRecoveryEpoch = async (runId: string) => {
  const doneKey = recoveryDoneKey(runId)
  const lockKey = recoveryLockKey(runId)

  while (true) {
    const done = await redis.get(doneKey)
    if (done) {
      const boundary = await loadRecoveryBoundary(runId)
      if (!boundary) {
        throw new Error('Visitor quota recovery completed without a valid boundary')
      }
      await assertRedisRunId(runId)
      markLocalRecoveryComplete(runId, boundary)
      return
    }

    const lockValue = `${process.pid}:${Math.random().toString(36).slice(2)}`
    const elected = await redis.set(lockKey, lockValue, 'EX', RECOVERY_LOCK_TTL_SECONDS, 'NX')
    if (elected === 'OK') {
      await runRecoveryAsWinner(runId, lockValue)
      return
    }

    await sleep(RECOVERY_POLL_MS)
  }
}

const recoverQuotaState = async (): Promise<void> => {
  const requestedRunId = await getRedisRunId()

  if (recoveryPromise) {
    if (recoveryPromiseRunId === requestedRunId) return recoveryPromise

    try {
      await recoveryPromise
    } catch {
      // The old Redis epoch is irrelevant to the newly requested recovery.
    }

    return recoverQuotaState()
  }

  quotaRecoveryReady = false
  recoveryPromiseRunId = requestedRunId
  recoveryPromise = (async () => {
    if (currentRunId && currentRunId !== requestedRunId) {
      recoveryBoundary = null
    }
    await waitForRecoveryEpoch(requestedRunId)
  })()

  let redisRunIdChanged = false

  try {
    await recoveryPromise
  } catch (error) {
    quotaRecoveryReady = false

    if (error instanceof RedisRecoveryRunIdChangedError) {
      redisRunIdChanged = true
    } else {
      throw error
    }
  } finally {
    recoveryPromise = null
    recoveryPromiseRunId = null
  }

  if (redisRunIdChanged) {
    return recoverQuotaState()
  }

  if (await getRedisRunId() !== requestedRunId) {
    quotaRecoveryReady = false
    return recoverQuotaState()
  }
}

const triggerQuotaRecovery = () => {
  void recoverQuotaState().catch((error) => {
    quotaRecoveryReady = false
    console.error('[Visitor quota] Recovery failed:', error)
  })
}

export const startQuotaRecoveryListener = (): void => {
  quotaRecoveryReady = false

  if (!listenersRegistered) {
    listenersRegistered = true

    redis.on('close', () => {
      quotaRecoveryReady = false
    })

    redis.on('reconnecting', () => {
      quotaRecoveryReady = false
    })

    redis.on('ready', () => {
      triggerQuotaRecovery()
    })
  }

  if (redis.status === 'ready') {
    triggerQuotaRecovery()
  } else {
    console.warn('[Visitor quota] Redis is not ready; visitor tracking remains fail-closed until recovery completes.')
  }
}

export const isQuotaRecoveryReady = () => quotaRecoveryReady

export const reserveVisitorQuota = async ({
  vendorId,
  subscriptionId,
  visitorLimit,
  persistedUsage,
  subscriptionCreatedAt,
}: VisitorQuotaReservationInput): Promise<VisitorQuotaReservationResult> => {
  if (!quotaRecoveryReady || redis.status !== 'ready') {
    return 'QUOTA_RECOVERY'
  }

  const mayInitialize =
    recoveryBoundary !== null && subscriptionCreatedAt.getTime() > recoveryBoundary.getTime()

  try {
    const result = await withRedisTimeout(
      redis.eval(
        RESERVE_QUOTA_LUA,
        1,
        quotaKey(vendorId, subscriptionId),
        String(Math.max(0, persistedUsage)),
        String(visitorLimit),
        mayInitialize ? '1' : '0'
      )
    )

    if (result === 2) return 'ALLOWED_AND_REACHED'
    return result === 1 ? 'ALLOWED' : 'QUOTA_REACHED'
  } catch (error) {
    quotaRecoveryReady = false
    console.error('[Visitor quota] Reservation failed:', error)
    return 'REDIS_UNAVAILABLE'
  }
}
