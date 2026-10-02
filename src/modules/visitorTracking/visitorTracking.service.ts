import { SubscriptionPlanType, VendorSubscriptionStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import httpStatus from 'http-status'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { startOfDay, endOfDay, subDays, format } from 'date-fns'
import geoip from 'geoip-lite'
import redis from '../../config/redis.config.js'
import { visitorQueue } from '../../config/bullmq.config.js'
import { getVendorSubscriptionAccess } from '../subscription/subscription.helper.js'
import {
  isQuotaRecoveryReady,
  reserveVisitorQuota,
} from './visitorTracking.quota.recovery.js'

// ── Quota dashboard types ─────────────────────────────────────────────────────

export type VisitorQuotaResponse =
  | {
      available: true
      currentPlan: { id: string; name: string; type: string }
      quota: {
        used: number
        limit: number
        remaining: number
        percentage: number
        reached: boolean
      }
      period: { startDate: string; endDate: string }
      subscription: {
        id: string
        status: string
        accessStatus: string
        showExpiryWarning: boolean
        expiredAt: string | null
        graceEndsAt: string | null
      }
      upgradeSuggestion: { id: string; name: string; visitorLimit: number } | null
    }
  | {
      available: false
      reason:
        | 'NO_SUBSCRIPTION'
        | 'TRIAL_NO_ENTITLEMENT'
        | 'SPECIAL_PLAN_NO_ENTITLEMENT'
        | 'NO_LIMIT_ON_PLAN'
      currentPlan: { id: string; name: string; type: string } | null
    }

export interface VendorTrackingEntitlement {
  allowed: boolean
  reason?:
    | 'NO_SUBSCRIPTION'
    | 'TRIAL_BLOCKED'
    | 'SPECIAL_PLAN_BLOCKED'
    | 'EXPIRED'
    | 'NO_LIMIT'
    | 'QUOTA_REACHED'
  subscriptionId?: string
  visitorLimit?: number | null
  currentUsage?: number
  accessStatus?: string
  subscriptionCreatedAt?: Date
}

const getVendorTrackingEntitlement = async (vendorId: string): Promise<VendorTrackingEntitlement> => {
  // 1. Resolve current active subscription
  let currentSubscription = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      status: VendorSubscriptionStatus.ACTIVE,
      startDate: { not: null },
      endDate: { not: null },
    },
    orderBy: {
      endDate: 'desc',
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      visitorLimit: true,
      plan: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  })

  // 2. If no ACTIVE subscription, check for most recent EXPIRED subscription (could be in 24h grace)
  if (!currentSubscription) {
    currentSubscription = await prisma.vendorSubscription.findFirst({
      where: {
        vendorId,
        status: VendorSubscriptionStatus.EXPIRED,
        startDate: { not: null },
        endDate: { not: null },
      },
      orderBy: {
        endDate: 'desc',
      },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        visitorLimit: true,
        plan: {
          select: {
            id: true,
            type: true,
          },
        },
      },
    })
  }

  // 3. No candidate subscription found or missing date boundaries
  if (!currentSubscription || !currentSubscription.startDate || !currentSubscription.endDate) {
    return { allowed: false, reason: 'NO_SUBSCRIPTION' }
  }

  // 4. Check plan type: Free Trial or Special Plans (Installment, No Plan)
  if (currentSubscription.plan.type === SubscriptionPlanType.FREE_TRIAL) {
    return { allowed: false, reason: 'TRIAL_BLOCKED', subscriptionId: currentSubscription.id }
  }

  if (
    currentSubscription.plan.type === SubscriptionPlanType.INSTALLMENT ||
    currentSubscription.plan.type === SubscriptionPlanType.NO_PLAN
  ) {
    return { allowed: false, reason: 'SPECIAL_PLAN_BLOCKED', subscriptionId: currentSubscription.id }
  }

  // 5. Check visitorLimit snapshot on VendorSubscription
  if (currentSubscription.visitorLimit === null || currentSubscription.visitorLimit === undefined) {
    return { allowed: false, reason: 'NO_LIMIT', subscriptionId: currentSubscription.id }
  }

  if (currentSubscription.visitorLimit <= 0) {
    return {
      allowed: false,
      reason: 'QUOTA_REACHED',
      subscriptionId: currentSubscription.id,
      visitorLimit: currentSubscription.visitorLimit,
      currentUsage: 0,
    }
  }

  // 6. Evaluate access using authoritative 24h grace logic
  const access = getVendorSubscriptionAccess(currentSubscription)
  if (access.accessStatus !== 'ACTIVE' && access.accessStatus !== 'EXPIRED_GRACE') {
    return {
      allowed: false,
      reason: 'EXPIRED',
      subscriptionId: currentSubscription.id,
      accessStatus: access.accessStatus,
    }
  }

  // 7. Count usage for the current subscription cycle only (>= currentSubscription.startDate)
  const currentUsage = await prisma.visitorTracking.count({
    where: {
      vendorId,
      createdAt: {
        gte: currentSubscription.startDate,
      },
    },
  })

  // 8. Quota enforcement: sequential boundary
  if (currentUsage >= currentSubscription.visitorLimit) {
    return {
      allowed: false,
      reason: 'QUOTA_REACHED',
      subscriptionId: currentSubscription.id,
      visitorLimit: currentSubscription.visitorLimit,
      currentUsage,
      accessStatus: access.accessStatus,
    }
  }

  return {
    allowed: true,
    subscriptionId: currentSubscription.id,
    visitorLimit: currentSubscription.visitorLimit,
    currentUsage,
    accessStatus: access.accessStatus,
    subscriptionCreatedAt: currentSubscription.createdAt,
  }
}

const awaitVisitorQueueAdd = async <T>(operation: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Visitor queue enqueue timed out')),
          2_000
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const trackVisitor = async (subDomain: string, ip?: string, userAgent?: string, clientCountry?: string, clientCity?: string) => {
  const vendor = await prisma.vendor.findFirst({
    where: {
      OR: [
        { subDomain },
        { customDomain: { domain: subDomain } },
      ],
    },
    select: {
      id: true,
      subDomain: true,
      customDomain: {
        select: {
          domain: true,
        },
      },
    },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found for this subdomain')
  }

  // Authoritative entitlement check before queueing
  const entitlement = await getVendorTrackingEntitlement(vendor.id)
  if (!entitlement.allowed) {
    if (entitlement.reason === 'QUOTA_REACHED') {
      if (vendor.subDomain) await redis.del(`vendor_profile:${vendor.subDomain.toLowerCase()}`)
      if (vendor.customDomain?.domain) await redis.del(`vendor_profile:${vendor.customDomain.domain.toLowerCase()}`)
    }
    return {
      success: true,
      tracked: false,
      reason: entitlement.reason,
    }
  }

  if (!isQuotaRecoveryReady()) {
    return {
      success: true,
      tracked: false,
      reason: 'QUOTA_RECOVERY',
    }
  }

  if (
    !entitlement.subscriptionId ||
    entitlement.visitorLimit === null ||
    entitlement.visitorLimit === undefined ||
    entitlement.currentUsage === undefined ||
    !entitlement.subscriptionCreatedAt
  ) {
    return {
      success: true,
      tracked: false,
      reason: 'QUOTA_RECOVERY',
    }
  }

  const quotaReservation = await reserveVisitorQuota({
    vendorId: vendor.id,
    subscriptionId: entitlement.subscriptionId,
    visitorLimit: entitlement.visitorLimit,
    persistedUsage: entitlement.currentUsage,
    subscriptionCreatedAt: entitlement.subscriptionCreatedAt,
  })

  if (quotaReservation !== 'ALLOWED' && quotaReservation !== 'ALLOWED_AND_REACHED') {
    if (quotaReservation === 'QUOTA_REACHED') {
      if (vendor.subDomain) await redis.del(`vendor_profile:${vendor.subDomain.toLowerCase()}`)
      if (vendor.customDomain?.domain) await redis.del(`vendor_profile:${vendor.customDomain.domain.toLowerCase()}`)
    }
    return {
      success: true,
      tracked: false,
      reason: quotaReservation,
    }
  }

  // Clear cache immediately if this exact visit reached the limit
  if (quotaReservation === 'ALLOWED_AND_REACHED') {
    if (vendor.subDomain) await redis.del(`vendor_profile:${vendor.subDomain.toLowerCase()}`)
    if (vendor.customDomain?.domain) await redis.del(`vendor_profile:${vendor.customDomain.domain.toLowerCase()}`)
  }

  let country = clientCountry || ''
  let city = clientCity || ''

  if (ip && !clientCountry) {
    const geo = geoip.lookup(ip)
    if (geo) {
      country = geo.country || ''
      city = geo.city || ''
    }
  }

  const logData = {
    trackingId: randomUUID(),
    vendorId: vendor.id,
    ip: ip || null,
    country,
    city,
    userAgent: userAgent || null,
  }

  try {
    await awaitVisitorQueueAdd(visitorQueue.add('track-visitor', logData))
  } catch (error) {
    // The reservation stays consumed: the enqueue outcome may be ambiguous after a Redis failure.
    console.error('Visitor queue error:', error)
    return { success: true, tracked: false, reason: 'REDIS_UNAVAILABLE' }
  }

  return { success: true, tracked: true }
}

const getVisitorStats = async (userId: string, startDate?: string, endDate?: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor profile not found')
  }

  const vendorId = vendor.id

  let start = startDate ? new Date(startDate) : subDays(startOfDay(new Date()), 6)
  let end = endDate ? new Date(endDate) : endOfDay(new Date())

  // If user passed only dates without time, we might want end of day, but new Date() parses it to 00:00 UTC.
  // For safety with datetime inputs, we just trust the parsed date.

  const cacheKey = `visitor_stats:${vendorId}:${start.toISOString()}:${end.toISOString()}`
  const cachedData = await redis.get(cacheKey)
  if (cachedData) {
    return JSON.parse(cachedData)
  }

  // 1. Total Visitors (for the selected range, or overall? Usually total is overall, but if filtered, maybe show filtered total?)
  // Let's show total for the selected period
  const totalVisitors = await prisma.visitorTracking.count({
    where: { 
      vendorId,
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  })

  // 2. Today's Visitors (We can keep this strictly as 'Today' regardless of filter, or rename it. We'll keep it as 'Today' to give perspective)
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const todayVisitors = await prisma.visitorTracking.count({
    where: {
      vendorId,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  })

  // 3. Date-wise Data
  const dateWiseRaw = await prisma.$queryRaw`
    SELECT DATE("createdAt") as date, COUNT(*)::int as count
    FROM "VisitorTracking"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt") ASC
  `
  
  const dateWiseData = (dateWiseRaw as any[]).map(d => ({
    date: format(new Date(d.date), 'yyyy-MM-dd'),
    count: Number(d.count)
  }))

  // 4. Minute-wise / Time-wise Data
  // If the range is larger than 1 day, minute-wise might be too crowded. 
  // But we will just pull minute-wise for the range if it's short, or maybe hourly if long?
  // The original was 'Last 1 hour'. If filter is applied, we can show data grouped by hour if range > 1 day, or minute if <= 1 day.
  // For simplicity, let's group by hour to avoid massive charts, or just use date_trunc('hour'...) 
  // Let's use hour grouping for better visualization when filtered
  const timeWiseRaw = await prisma.$queryRaw`
    SELECT date_trunc('hour', "createdAt") as time, COUNT(*)::int as count
    FROM "VisitorTracking"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    GROUP BY date_trunc('hour', "createdAt")
    ORDER BY date_trunc('hour', "createdAt") ASC
  `
  
  const minuteWiseData = (timeWiseRaw as any[]).map(d => ({
    time: format(new Date(d.time), 'yyyy-MM-dd HH:mm'),
    count: Number(d.count)
  }))

  // 5. Location/Country-wise Data
  const locationWiseRaw = await prisma.$queryRaw`
    SELECT COALESCE(country, 'Unknown') as country, COUNT(*)::int as count
    FROM "VisitorTracking"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    GROUP BY COALESCE(country, 'Unknown')
    ORDER BY count DESC
  `
  
  const locationData = (locationWiseRaw as any[]).map(d => ({
    country: String(d.country),
    count: Number(d.count)
  }))

  const result = {
    totalVisitors,
    todayVisitors,
    dateWiseData,
    minuteWiseData,
    locationData
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 900)

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// getVendorVisitorQuota — authoritative quota display for vendor dashboard
// ─────────────────────────────────────────────────────────────────────────────

const NON_QUOTA_PLAN_TYPES = new Set<string>([
  SubscriptionPlanType.FREE_TRIAL,
  SubscriptionPlanType.INSTALLMENT,
  SubscriptionPlanType.NO_PLAN,
])

const getVendorVisitorQuota = async (userId: string): Promise<VisitorQuotaResponse> => {
  // Resolve vendor from userId
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor profile not found')
  }

  const vendorId = vendor.id

  // 1. Resolve best current subscription, then fall back to EXPIRED (24h grace candidate)
  let sub = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      status: { in: [VendorSubscriptionStatus.ACTIVE, VendorSubscriptionStatus.TRIAL] },
      startDate: { not: null },
      endDate: { not: null },
    },
    orderBy: { endDate: 'desc' },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      visitorLimit: true,
      plan: { select: { id: true, name: true, type: true } },
    },
  })

  if (!sub) {
    sub = await prisma.vendorSubscription.findFirst({
      where: {
        vendorId,
        status: VendorSubscriptionStatus.EXPIRED,
        startDate: { not: null },
        endDate: { not: null },
      },
      orderBy: { endDate: 'desc' },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        visitorLimit: true,
        plan: { select: { id: true, name: true, type: true } },
      },
    })
  }

  // 2. No subscription at all
  if (!sub || !sub.startDate || !sub.endDate) {
    return { available: false, reason: 'NO_SUBSCRIPTION', currentPlan: null }
  }

  const planInfo = { id: sub.plan.id, name: sub.plan.name, type: sub.plan.type }

  // 3. Plans with no visitor entitlement
  if (NON_QUOTA_PLAN_TYPES.has(sub.plan.type)) {
    const reason =
      sub.plan.type === SubscriptionPlanType.FREE_TRIAL
        ? 'TRIAL_NO_ENTITLEMENT'
        : 'SPECIAL_PLAN_NO_ENTITLEMENT'
    return { available: false, reason, currentPlan: planInfo }
  }

  // 4. Null visitorLimit on the snapshot — plan does not carry a limit
  if (sub.visitorLimit === null || sub.visitorLimit === undefined) {
    return { available: false, reason: 'NO_LIMIT_ON_PLAN', currentPlan: planInfo }
  }

  // 5. Access status via canonical grace helper
  const access = getVendorSubscriptionAccess(sub)

  // 6. Count current-cycle usage (startDate inclusive, no upper bound — tracks all within this period)
  const used = await prisma.visitorTracking.count({
    where: {
      vendorId,
      createdAt: { gte: sub.startDate },
    },
  })

  const limit = sub.visitorLimit
  const remaining = Math.max(limit - used, 0)
  const percentage = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 100
  const reached = used >= limit

  // 7. Dynamic upgrade suggestion — smallest plan with visitorLimit > current snapshot
  //    Active plans only, excluding INSTALLMENT/FREE_TRIAL/NO_PLAN, not hardcoded by name
  const upgradePlan = await prisma.subscriptionPlan.findFirst({
    where: {
      isActive: true,
      visitorLimit: { gt: limit },
      NOT: {
        type: {
          in: [
            SubscriptionPlanType.FREE_TRIAL,
            SubscriptionPlanType.INSTALLMENT,
            SubscriptionPlanType.NO_PLAN,
          ],
        },
      },
    },
    orderBy: [
      { visitorLimit: 'asc' },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
    select: { id: true, name: true, visitorLimit: true },
  })

  return {
    available: true,
    currentPlan: planInfo,
    quota: { used, limit, remaining, percentage, reached },
    period: {
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate.toISOString(),
    },
    subscription: {
      id: sub.id,
      status: sub.status,
      accessStatus: access.accessStatus,
      showExpiryWarning: access.showExpiryWarning,
      expiredAt: access.expiredAt?.toISOString() ?? null,
      graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
    },
    upgradeSuggestion:
      upgradePlan && upgradePlan.visitorLimit !== null
        ? {
            id: upgradePlan.id,
            name: upgradePlan.name,
            visitorLimit: upgradePlan.visitorLimit,
          }
        : null,
  }
}

export const VisitorTrackingService = {
  trackVisitor,
  getVisitorStats,
  getVendorTrackingEntitlement,
  getVendorVisitorQuota,
}
