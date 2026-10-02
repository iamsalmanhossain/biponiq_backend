import type { Request, Response } from 'express'
import { VisitorTrackingService } from './visitorTracking.service.js'
import catchAsync from '../../shared/utils/catchAsync.js'

const trackVisitor = catchAsync(async (req: Request, res: Response) => {
  const { subDomain } = req.params
  // Use x-forwarded-for header if available, otherwise fallback to req.ip
  const rawIp = req.headers['x-forwarded-for'] || req.ip
  const ip = typeof rawIp === 'string' ? rawIp.split(',')[0]?.trim() : Array.isArray(rawIp) ? rawIp[0] : req.ip
  const userAgent = req.headers['user-agent'] as string | undefined

  const { country, city } = req.body || {}

  const result = await VisitorTrackingService.trackVisitor(
    subDomain as string,
    ip as string | undefined,
    userAgent as string | undefined,
    country,
    city
  )

  res.status(200).json({
    success: true,
    message: result.tracked ? 'Visitor tracked successfully' : 'Visitor tracking skipped',
    data: result,
  })
})


const getVisitorStats = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const { startDate, endDate } = req.query

  const result = await VisitorTrackingService.getVisitorStats(
    userId,
    startDate as string | undefined,
    endDate as string | undefined
  )

  res.status(200).json({
    success: true,
    message: 'Visitor stats retrieved successfully',
    data: result,
  })
})

const getVisitorQuota = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const result = await VisitorTrackingService.getVendorVisitorQuota(userId)
  res.status(200).json({
    success: true,
    message: 'Visitor quota retrieved successfully',
    data: result,
  })
})

export const VisitorTrackingController = {
  trackVisitor,
  getVisitorStats,
  getVisitorQuota,
}
