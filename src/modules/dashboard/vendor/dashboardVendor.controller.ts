import { Request, Response } from 'express'
import { sendResponse } from '../../../shared/utils/sendResponse.js'
import catchAsync from '../../../shared/utils/catchAsync.js'
import { StatusCodes } from 'http-status-codes'
import { VendorDashboardService } from './dashboardVendor.service.js'
import AppError from '../../../shared/errors/AppError.js'
import { OrderStatus, ProductStatus } from '@prisma/client'
import { calculatePagination } from '../../../shared/pagination/pagination.js'

// Get vendor dashboard stats
const vendorDashboardStats = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const { sort, status } = req.query as { sort: string; status: ProductStatus }

  const result = await VendorDashboardService.vendorDashboardStats(userId, sort, status)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor dashboard statistics retrieved successfully',
    data: result,
  })
})

// get vendor Orders
const getVendorOrders = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const status = req.query.status as OrderStatus
  const { page, limit, skip } = calculatePagination(req.query)
  const sort = req.query.sort as string
  const result = await VendorDashboardService.getVendorOrders(
    userId,
    page,
    limit,
    skip,
    sort,
    status
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor orders retrieved successfully',
    data: result,
  })
})

//get customer list
const getGuestCustomerList = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id

  const { page, limit, skip } = calculatePagination(req.query)
  const district = req.query.district as string
  const division = req.query.division as string
  const sort = req.query.sort as string
  const result = await VendorDashboardService.getCustomerList(
    userId,
    page,
    limit,
    skip,
    sort,
    division,
    district
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Customer list retrieved successfully',
    data: result,
  })
})

//  set vendor delivery charge
const vendorDeliveryCharge = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const { insideCharge, outsideCharge } = req.body

  if (!userId) throw new AppError(StatusCodes.NOT_FOUND, "Vendor's User Id required")

  const result = await VendorDashboardService.setDeliveryCharge(
    userId,
    Number(insideCharge),
    Number(outsideCharge)
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor delivery charge is set',
    data: result,
  })
})

// Get social links
const getSocialLinks = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const result = await VendorDashboardService.getSocialLinks(userId)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Social links retrieved successfully',
    data: result,
  })
})

// Update social links
const updateSocialLinks = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const socialLinks = req.body
  const result = await VendorDashboardService.updateSocialLinks(userId, socialLinks)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Social links updated successfully',
    data: result,
  })
})

export const VendorDashboardController = {
  vendorDashboardStats,
  getVendorOrders,
  getGuestCustomerList,
  vendorDeliveryCharge,
  getSocialLinks,
  updateSocialLinks,
}
