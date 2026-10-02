import axios from 'axios'
import crypto from 'crypto'
import httpStatus from 'http-status'
import { subDays, subMonths, subYears, format } from 'date-fns'
import { prisma } from '../../lib/prisma.js'
import redis from '../../config/redis.config.js'
import AppError from '../../shared/errors/AppError.js'
import {
  DynamicTiktokEventPayload,
  TiktokPixelCredentialsPayload,
} from './tiktokPixel.interface.js'

// SHA256 hashing required for TikTok user matching parameters
const hashData = (data: string): string => {
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex')
}

// Phone number sanitizer (digits only)
const sanitizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '')
}

// 1. Save or update TikTok Pixel credentials for vendor
const saveCredentials = async (
  userId: string,
  payload: TiktokPixelCredentialsPayload
) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, subDomain: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
  }

  const updatedVendor = await prisma.vendor.update({
    where: { userId },
    data: {
      tiktokPixelId: payload.tiktokPixelId,
      tiktokAccessToken: payload.tiktokAccessToken,
      tiktokTestCode: payload.tiktokTestCode || null,
    },
    select: {
      id: true,
      tiktokPixelId: true,
      tiktokAccessToken: true,
      tiktokTestCode: true,
    },
  })

  // Invalidate vendor profile caches so storefront reflects new TikTok Pixel ID immediately
  await redis.del(`vendor_profile:${vendor.id}`)
  await redis.del(`vendor_profile:${vendor.subDomain}`)

  return updatedVendor
}

// 2. Get TikTok Pixel credentials
const getCredentials = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: {
      id: true,
      tiktokPixelId: true,
      tiktokAccessToken: true,
      tiktokTestCode: true,
    },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
  }

  return vendor
}

// 3. Delete TikTok Pixel credentials
const deleteCredentials = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, subDomain: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
  }

  const result = await prisma.vendor.update({
    where: { userId },
    data: {
      tiktokPixelId: null,
      tiktokAccessToken: null,
      tiktokTestCode: null,
    },
    select: {
      id: true,
    },
  })

  // Invalidate vendor profile caches
  await redis.del(`vendor_profile:${vendor.id}`)
  await redis.del(`vendor_profile:${vendor.subDomain}`)

  return result
}

// 4. Send event to TikTok Events API (Server-Side CAPI) & Queue internal event
const sendEventsApi = async (
  vendorIdentifier: string,
  payloadData: DynamicTiktokEventPayload
) => {
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      vendorIdentifier
    )

  const vendor = await prisma.vendor.findFirst({
    where: isUUID
      ? { id: vendorIdentifier }
      : {
          OR: [
            { subDomain: vendorIdentifier },
            { customDomain: { domain: vendorIdentifier } },
          ],
        },
    select: {
      id: true,
      tiktokPixelId: true,
      tiktokAccessToken: true,
      tiktokTestCode: true,
    },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found for this identifier')
  }

  const {
    eventName,
    eventId,
    eventTime,
    url,
    testEventCode,
    customerData,
    eventData,
  } = payloadData

  // Enqueue internal tracking for analytics regardless of external API configuration
  const internalPayload = {
    vendorId: vendor.id,
    eventName,
    url: url || null,
    ip: customerData?.client_ip_address || null,
    country: customerData?.country || null,
    city: customerData?.city || null,
    createdAt: new Date().toISOString(),
  }
  await redis.rpush('tiktok_pixel_events_queue', JSON.stringify(internalPayload))

  // If TikTok Pixel or Access Token is missing, notify caller to skip gracefully
  if (!vendor.tiktokPixelId || !vendor.tiktokAccessToken) {
    throw new Error('TikTok Pixel or Access Token not configured for this vendor.')
  }

  const targetTestCode =
    testEventCode || vendor.tiktokTestCode || undefined

  // Hash user identity fields per TikTok Events API requirements
  const hashedEmail = customerData?.email
    ? hashData(customerData.email)
    : undefined
  const hashedPhone = customerData?.phone
    ? hashData(sanitizePhone(customerData.phone))
    : undefined
  const hashedExternalId = customerData?.external_id
    ? hashData(customerData.external_id)
    : undefined

  const tikTokApiUrl = 'https://business-api.tiktok.com/open_api/v1.3/event/track/'

  const tikTokPayload = {
    event_source: 'web',
    event_source_id: vendor.tiktokPixelId,
    ...(targetTestCode && { test_event_code: targetTestCode }),
    data: [
      {
        event: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        user: {
          ...(hashedEmail && { email: hashedEmail }),
          ...(hashedPhone && { phone: hashedPhone }),
          ...(hashedExternalId && { external_id: hashedExternalId }),
          ...(customerData?.ttclid && { ttclid: customerData.ttclid }),
          ...(customerData?.ttp && { ttp: customerData.ttp }),
          ...(customerData?.client_ip_address && {
            ip: customerData.client_ip_address,
          }),
          ...(customerData?.client_user_agent && {
            user_agent: customerData.client_user_agent,
          }),
        },
        properties: {
          ...(eventData?.currency && { currency: eventData.currency }),
          ...(eventData?.value !== undefined && { value: eventData.value }),
          ...(eventData?.contents && { contents: eventData.contents }),
          ...(eventData?.query && { query: eventData.query }),
          ...(eventData?.description && { description: eventData.description }),
          ...(eventData?.order_id && { order_id: eventData.order_id }),
          ...(eventData?.status && { status: eventData.status }),
          ...(eventData && { ...eventData }),
        },
        page: {
          ...(url && { url }),
        },
      },
    ],
  }

  try {
    const response = await axios.post(tikTokApiUrl, tikTokPayload, {
      headers: {
        'Access-Token': vendor.tiktokAccessToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    })

    return response.data
  } catch (error: any) {
    const tikTokError =
      error.response?.data?.message ||
      error.response?.data?.error?.message ||
      error.message
    console.error(`[TikTok Events API Error - Vendor: ${vendor.id}]:`, tikTokError)

    throw new Error(`Failed to send event to TikTok Events API: ${tikTokError}`, {
      cause: error,
    })
  }
}

// 5. Track event directly to queue (lightweight)
const trackEvent = async (
  identifier: string,
  eventName: string,
  url?: string,
  ip?: string,
  country?: string,
  city?: string
) => {
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier
    )

  const vendor = await prisma.vendor.findFirst({
    where: isUUID
      ? { id: identifier }
      : {
          OR: [
            { subDomain: identifier },
            { customDomain: { domain: identifier } },
          ],
        },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Vendor not found for this identifier'
    )
  }

  const payload = {
    vendorId: vendor.id,
    eventName,
    url: url || null,
    ip: ip || null,
    country: country || null,
    city: city || null,
    createdAt: new Date().toISOString(),
  }

  await redis.rpush('tiktok_pixel_events_queue', JSON.stringify(payload))

  return { success: true }
}

// 6. Get TikTok Event Stats for Vendor Dashboard
const getEventStats = async (userId: string, filterRange: string) => {
  const cacheKey = `tiktok_pixel_stats:${userId}:${filterRange}`
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
    FROM "TiktokPixelEvent"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${now}
    GROUP BY "eventName"
    ORDER BY count DESC
  `

  // Get daily time series data for line chart
  const timeSeriesRaw = await prisma.$queryRaw`
    SELECT date_trunc('day', "createdAt") as time, COUNT(*)::int as count
    FROM "TiktokPixelEvent"
    WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${start} AND "createdAt" <= ${now}
    GROUP BY date_trunc('day', "createdAt")
    ORDER BY date_trunc('day', "createdAt") ASC
  `

  const timeSeriesData = (timeSeriesRaw as any[]).map((d) => ({
    time: format(new Date(d.time), 'MMM dd'),
    count: Number(d.count),
  }))

  const eventStats = (eventCountsRaw as any[]).map((d) => ({
    eventName: String(d.eventName),
    count: Number(d.count),
    lastReceived: d.lastReceived,
  }))

  const result = {
    timeSeriesData,
    eventStats,
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 900) // 15 mins cache
  return result
}

export const TiktokPixelService = {
  saveCredentials,
  getCredentials,
  deleteCredentials,
  sendEventsApi,
  trackEvent,
  getEventStats,
}
