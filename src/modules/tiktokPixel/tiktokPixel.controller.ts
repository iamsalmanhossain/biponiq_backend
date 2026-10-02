import type { Request, Response } from 'express'
import { TiktokPixelService } from './tiktokPixel.service.js'
import catchAsync from '../../shared/utils/catchAsync.js'
import httpStatus from 'http-status'

// 1. Setup / Update TikTok Pixel Credentials (Vendor Protected)
const updateCredentials = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const { tiktokPixelId, tiktokAccessToken, tiktokTestCode } = req.body

  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      success: false,
      message: 'Unauthorized: User ID is missing.',
    })
    return
  }

  if (!tiktokPixelId || !tiktokAccessToken) {
    res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'tiktokPixelId and tiktokAccessToken are required.',
    })
    return
  }

  const result = await TiktokPixelService.saveCredentials(userId as string, {
    tiktokPixelId,
    tiktokAccessToken,
    tiktokTestCode,
  })

  res.status(httpStatus.OK).json({
    success: true,
    message: 'TikTok Pixel credentials updated successfully!',
    data: result,
  })
})

// 2. Get TikTok Pixel Credentials (Vendor Protected)
const getCredentials = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id

  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      success: false,
      message: 'Unauthorized: User ID is missing.',
    })
    return
  }

  const result = await TiktokPixelService.getCredentials(userId as string)

  res.status(httpStatus.OK).json({
    success: true,
    message: 'TikTok Pixel credentials retrieved successfully',
    data: result,
  })
})

// 3. Delete TikTok Pixel Credentials (Vendor Protected)
const deleteCredentials = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id

  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      success: false,
      message: 'Unauthorized: User ID is missing.',
    })
    return
  }

  await TiktokPixelService.deleteCredentials(userId as string)

  res.status(httpStatus.OK).json({
    success: true,
    message: 'TikTok Pixel credentials deleted successfully',
  })
})

// 4. Track Dynamic Event to TikTok Events API (Public - Storefront)
const trackDynamicEvent = catchAsync(async (req: Request, res: Response) => {
  const { vendorId } = req.params
  const {
    eventName,
    eventId,
    eventTime,
    url,
    testEventCode,
    customerData,
    eventData,
  } = req.body

  if (!vendorId || !eventName || !eventId) {
    res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'vendorId, eventName, and eventId are required.',
    })
    return
  }

  const clientIp = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || undefined

  const userAgent = req.headers['user-agent'] as string | undefined

  const enrichedCustomerData = {
    ...customerData,
    client_ip_address: customerData?.client_ip_address || clientIp,
    client_user_agent: customerData?.client_user_agent || userAgent,
  }

  try {
    const result = await TiktokPixelService.sendEventsApi(vendorId as string, {
      eventName,
      eventId,
      eventTime,
      url,
      testEventCode,
      customerData: enrichedCustomerData,
      eventData,
    })

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Event tracked and sent to TikTok Events API successfully!',
      tiktokResponse: result,
    })
  } catch (error: any) {
    // If TikTok Pixel or Access Token is not configured for vendor, gracefully skip
    if (
      error?.message?.includes('TikTok Pixel or Access Token not configured')
    ) {
      res.status(httpStatus.OK).json({
        success: false,
        message: 'TikTok Events API skipped: Pixel not configured for this vendor.',
      })
      return
    }

    throw error
  }
})

// 5. Lightweight Direct Event Tracking (Public - Storefront)
const trackEvent = catchAsync(async (req: Request, res: Response) => {
  const { vendorId } = req.params
  const { eventName, url, country, city } = req.body
  const ip = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'] || req.ip || undefined

  await TiktokPixelService.trackEvent(
    vendorId as string,
    eventName,
    url,
    ip as string | undefined,
    country,
    city
  )

  res.status(httpStatus.OK).json({
    success: true,
    message: 'TikTok event tracked successfully',
  })
})

// 6. Get TikTok Event Stats / Analytics (Vendor Protected)
const getEventStats = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const filterRange = (req.query.filterRange as string) || '7days'

  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      success: false,
      message: 'Unauthorized',
    })
    return
  }

  const result = await TiktokPixelService.getEventStats(userId as string, filterRange)

  res.status(httpStatus.OK).json({
    success: true,
    message: 'TikTok event stats retrieved successfully',
    data: result,
  })
})

export const TiktokPixelController = {
  updateCredentials,
  getCredentials,
  deleteCredentials,
  trackDynamicEvent,
  trackEvent,
  getEventStats,
}
