import { Request, Response } from 'express'
import catchAsync from '../../../shared/utils/catchAsync.js'
import { sendResponse } from '../../../shared/utils/sendResponse.js'
import { AffiliateDashboardService } from './dashboardAffiliate.service.js'

const getDashboard = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.getDashboard(req.user!.id)
  sendResponse(res, { statusCode: 200, success: true, message: 'Dashboard data', data: result })
})

const getOrders = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.getOrders(req.user!.id, req.query as any)
  sendResponse(res, { statusCode: 200, success: true, message: 'Orders fetched', data: result })
})

const getCoupons = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.getCoupons(req.user!.id)
  sendResponse(res, { statusCode: 200, success: true, message: 'Coupons fetched', data: result })
})

const getPayouts = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.getPayouts(req.user!.id)
  sendResponse(res, { statusCode: 200, success: true, message: 'Payouts fetched', data: result })
})

const requestPayout = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.requestPayout(req.user!.id, req.body)
  sendResponse(res, { statusCode: 201, success: true, message: 'Payout requested', data: result })
})

const getProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.getProfile(req.user!.id)
  sendResponse(res, { statusCode: 200, success: true, message: 'Profile fetched', data: result })
})

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.updateProfile(req.user!.id, req.body)
  sendResponse(res, { statusCode: 200, success: true, message: 'Profile updated', data: result })
})

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.changePassword(req.user!.id, req.body)
  sendResponse(res, { statusCode: 200, success: true, message: result.message, data: null })
})

const getPayoutMethods = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.getPayoutMethods(req.user!.id)
  sendResponse(res, { statusCode: 200, success: true, message: 'Payout methods fetched', data: result })
})

const addPayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.addPayoutMethod(req.user!.id, req.body)
  sendResponse(res, { statusCode: 201, success: true, message: 'Payout method added', data: result })
})

const deletePayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateDashboardService.deletePayoutMethod(req.user!.id, req.params.id! as string)
  sendResponse(res, { statusCode: 200, success: true, message: 'Payout method deleted', data: result })
})

export const AffiliateDashboardController = {
  getDashboard, getOrders, getCoupons, getPayouts, requestPayout,
  getProfile, updateProfile, changePassword,
  getPayoutMethods, addPayoutMethod, deletePayoutMethod
}
