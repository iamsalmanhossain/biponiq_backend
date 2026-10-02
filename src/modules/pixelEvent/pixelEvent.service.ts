import redis from '../../config/redis.config.js'
import httpStatus from 'http-status'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { subDays, subMonths, subYears, format } from 'date-fns'

const trackEvent = async (identifier: string, eventName: string, url?: string, ip?: string, country?: string, city?: string) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  
  const vendor = await prisma.vendor.findFirst({
    where: isUUID ? { id: identifier } : { subDomain: identifier },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found for this subdomain')
  }

  
  const payload = {
    vendorId: vendor.id,
    eventName,
    url: url || null,
    ip: ip || null,
    country: country || null,
    city: city || null,
    createdAt: new Date().toISOString() // Set exact time of event
  }
  
  await redis.rpush('pixel_events_queue', JSON.stringify(payload))

  return { success: true }
}

const getEventStats = async (userId: string, filterRange: string) => {
  
  const cacheKey = `pixel_stats:${userId}:${filterRange}`
  const cachedStats = await redis.get(cacheKey)
  if (cachedStats) {
    return JSON.parse(cachedStats)
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
  }

  const vendorId = vendor.id

  const now = new Date()
  let start = subDays(now, 7) // default 7 days

  if (filterRange === '1month') {
    start = subMonths(now, 1)
  } else if (filterRange === '1year') {
    start = subYears(now, 1)
  }

  // Group by eventName to get total counts
  const eventCountsRaw = await prisma.$queryRaw`
    SELECT "eventName", COUNT(*)::int as count, MAX("createdAt") as "lastReceived"
    FROM "PixelEvent"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${now}
    GROUP BY "eventName"
    ORDER BY count DESC
  `

  // Also get the time series data for the line chart (daily counts for all events)
  const timeSeriesRaw = await prisma.$queryRaw`
    SELECT date_trunc('day', "createdAt") as time, COUNT(*)::int as count
    FROM "PixelEvent"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${now}
    GROUP BY date_trunc('day', "createdAt")
    ORDER BY date_trunc('day', "createdAt") ASC
  `

  const timeSeriesData = (timeSeriesRaw as any[]).map(d => ({
    time: format(new Date(d.time), 'MMM dd'),
    count: Number(d.count)
  }))

  const eventStats = (eventCountsRaw as any[]).map(d => ({
    eventName: String(d.eventName),
    count: Number(d.count),
    lastReceived: d.lastReceived,
  }))

  const result = {
    timeSeriesData,
    eventStats
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 900) // 15 mins
  return result
}

export const PixelEventService = {
  trackEvent,
  getEventStats
}
