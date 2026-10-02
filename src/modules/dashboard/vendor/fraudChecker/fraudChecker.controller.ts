import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import catchAsync from '../../../../shared/utils/catchAsync.js'
import { sendResponse } from '../../../../shared/utils/sendResponse.js'
import { FraudCheckerService } from './fraudChecker.service.js'

const addApiKey = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id

  const result = await FraudCheckerService.addApiKey(userId, req.body.bdCourierApiKey)

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'BD Courier API Key added successfully',
    data: result,
  })
})

const checkFraudStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const { phone } = req.body

  const result = await FraudCheckerService.checkFraudStatus(userId, phone)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Fraud status checked successfully',
    data: result,
  })
})

const getVendorPlanDetails = catchAsync(async (req: Request, res: Response) => {
  const result = await FraudCheckerService.getVendorPlanDetails(req.user.id)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor plan details fetched successfully',
    data: result,
  })
})

export const FraudCheckerController = {
  addApiKey,
  checkFraudStatus,
  getVendorPlanDetails,
}
