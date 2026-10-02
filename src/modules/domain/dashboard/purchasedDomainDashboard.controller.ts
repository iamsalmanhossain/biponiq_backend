import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import catchAsync from '../../../shared/utils/catchAsync.js'
import { sendResponse } from '../../../shared/utils/sendResponse.js'

import { PurchasedDomainDashboardService } from './purchasedDomainDashboard.service.js'

const getManagedPurchasedDomain = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id

  const result = await PurchasedDomainDashboardService.getVendorManagedPurchasedDomain(userId)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Managed purchased domain retrieved successfully',
    data: result,
  })
})

export const PurchasedDomainDashboardController = {
  getManagedPurchasedDomain,
}
