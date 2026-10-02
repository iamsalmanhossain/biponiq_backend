import type { Request, Response } from 'express'
import { PixelEventService } from './pixelEvent.service.js'
import catchAsync from '../../shared/utils/catchAsync.js'

const trackEvent = catchAsync(async (req: Request, res: Response) => {
  const { vendorId } = req.params;
  const { eventName, url, country, city } = req.body;
  const ip = Array.isArray(req.headers['x-forwarded-for']) 
    ? req.headers['x-forwarded-for'][0] 
    : req.headers['x-forwarded-for'] || req.ip || undefined;
  
  await PixelEventService.trackEvent(
    vendorId as string, 
    eventName, 
    url, 
    ip as string | undefined,
    country,
    city
  ); res.status(200).json({
    success: true,
    message: 'Event tracked successfully',
  })
})

const getEventStats = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id
  const filterRange = (req.query.filterRange as string) || '7days'

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const result = await PixelEventService.getEventStats(userId, filterRange)

  res.status(200).json({
    success: true,
    message: 'Event stats retrieved successfully',
    data: result,
  })
})

export const PixelEventController = {
  trackEvent,
  getEventStats
}
