import { Request, Response } from 'express'
import catchAsync from '../../../../shared/utils/catchAsync.js'
import { sendResponse } from '../../../../shared/utils/sendResponse.js'
import { VendorAffiliateService } from './vendorAffiliate.service.js'
import httpStatus from 'http-status'

const getAffiliates = catchAsync(async (req: Request, res: Response) => {
  const result = await VendorAffiliateService.getAffiliates(req.user!.id)
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Affiliates fetched successfully', data: result })
})

const getAffiliateOrders = catchAsync(async (req: Request, res: Response) => {
  const result = await VendorAffiliateService.getAffiliateOrders(req.user!.id, String(req.params.id), req.query)
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Affiliate orders fetched', data: result })
})

const approvePayout = catchAsync(async (req: Request, res: Response) => {
  const result = await VendorAffiliateService.approvePayout(req.user!.id, String(req.params.payoutId), req.body)
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Payout ${req.body.status.toLowerCase()} successfully`, data: result })
})

export const VendorAffiliateController = {
  getAffiliates, getAffiliateOrders, approvePayout
}
