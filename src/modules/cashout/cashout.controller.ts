import { Request, Response } from 'express'
import catchAsync from '../../shared/utils/catchAsync.js'
import { CashoutService } from './cashout.service.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import httpStatus from 'http-status'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { getVendorId } from './cashout.helper.js'

// Admin Get Cashout Settings
const getCashoutSetting = catchAsync(async (req: Request, res: Response) => {
  const result = await CashoutService.getCashoutSetting()

  ApiResponse.success(res, result, 'Cashout setting retrieved successfully', httpStatus.OK)
})

// Admin Update Cashout Settings
const updateCashoutSetting = catchAsync(async (req: Request, res: Response) => {
  const result = await CashoutService.updateCashoutSetting(req.body)

  ApiResponse.success(res, result, 'Cashout setting updated successfully', httpStatus.OK)
})

// Cashout Summary
const getCashoutSummary = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id

  const vendorId = await getVendorId(userId)

  const result = await CashoutService.getCashoutSummary(vendorId as string)

  ApiResponse.success(res, result, 'Cashout summary retrieved successfully', httpStatus.OK)
})

// Vendor Make Cashout Request
const createCashout = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id

  const vendorId = await getVendorId(userId)

  const result = await CashoutService.createCashout(vendorId as string, req.body)

  ApiResponse.success(res, result, 'Cashout request created successfully', httpStatus.CREATED)
})

// Admin Get Cashout Requests With Filters
const getCashoutsForAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await CashoutService.getCashoutsForAdmin(req.query)

  ApiResponse.success(res, result, 'Cashout requests retrieved successfully', httpStatus.OK)
})

// Admin Can Update Cashout Status
const updateCashoutStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params

  const result = await CashoutService.updateCashoutStatus(id as string, req.body)

  ApiResponse.success(res, result, 'Cashout status updated successfully', httpStatus.OK)
})

export const CashoutController = {
  getCashoutSetting,
  updateCashoutSetting,
  getCashoutSummary,
  createCashout,
  getCashoutsForAdmin,
  updateCashoutStatus,
}
