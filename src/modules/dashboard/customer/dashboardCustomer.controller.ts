import { Request, Response } from 'express'
import { sendResponse } from '../../../shared/utils/sendResponse.js'
import catchAsync from '../../../shared/utils/catchAsync.js'
import { StatusCodes } from 'http-status-codes'
import { CustomerDashboardService } from './dashboardCustomer.service.js'
import AppError from '../../../shared/errors/AppError.js'

const customerDashboardStats = catchAsync(async (req: Request, res: Response) => {
  const customerId = req.user.id

  if (!customerId) throw new AppError(StatusCodes.NOT_FOUND, 'Invalid Customer ID')

  const result = await CustomerDashboardService.customerDashboardStats(customerId)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Customer dashboard data retrieved successfully',
    data: result,
  })
})

const getOrderDetail = catchAsync(async (req: Request, res: Response) => {
  const customerId = req.user.id
  if (!customerId) throw new AppError(StatusCodes.NOT_FOUND, 'Invalid Customer ID')

  const result = await CustomerDashboardService.getOrderDetail(customerId)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Order detail retrieved successfully',
    data: result,
  })
})

export const CustomerDashboardController = {
  customerDashboardStats,
  getOrderDetail,
}
