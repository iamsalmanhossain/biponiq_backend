import { Request, Response } from 'express'
import { sendResponse } from '../../../shared/utils/sendResponse.js'
import catchAsync from '../../../shared/utils/catchAsync.js'
import { StatusCodes } from 'http-status-codes'
import { AdminDashboardService } from './dashboardAdmin.service.js'
import { calculatePagination } from '../../../shared/pagination/pagination.js'
import { AdminAccountStatus, VendorAccountStatus } from '@prisma/client'
import AppError from '../../../shared/errors/AppError.js'

// Get admin dashboard stats
const adminDashboardStats = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const result = await AdminDashboardService.adminDashboardStats(adminUserId)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Admin dashboard statistics retrieved successfully',
    data: result,
  })
})

// Get vendor List
const getVendorList = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const { page, limit, skip } = calculatePagination(req.query)
  const status = req.query.status as VendorAccountStatus
  const district = req.query.district as string
  const division = req.query.division as string
  const search=req.query.search as string
  const result = await AdminDashboardService.getVendorList(
    adminUserId,
    page,
    limit,
    skip,
    status,
    division,
    district,
    search
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor list retrieved successfully',
    data: result,
  })
})

// get guest customer list
const getGuestCustomerList = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const { page, limit, skip } = calculatePagination(req.query)
  const district = req.query.district as string
  const division = req.query.division as string
  const search=req.query.search as string
  const result = await AdminDashboardService.getGuestCustomerList(
    adminUserId,
    page,
    limit,
    skip,
    division,
    district,
    search
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Customer list retrieved successfully',
    data: result,
  })
})

const updateAdminAccountStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body
  const adminUserId = req.user.id

  if (!id || Array.isArray(id)) {
    throw new AppError(400, 'Invalid admin id')
  }
  

  if (!Object.values(AdminAccountStatus).includes(status)) {
    throw new AppError(400, 'Invalid account status')
  }

  await AdminDashboardService.updateAdminAccountStatus(
    id,
    adminUserId,
    status as AdminAccountStatus
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin account status updated successfully',
  })
})

const getAffiliatesPerformance = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const { page, limit, skip } = calculatePagination(req.query)
  const search = req.query.search as string

  const result = await AdminDashboardService.getAffiliatesPerformance(
    adminUserId,
    page,
    limit,
    skip,
    search
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Affiliates performance retrieved successfully',
    data: result,
  })
})

const getAffiliatePayoutRequests = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const result = await AdminDashboardService.getAffiliatePayoutRequests(
    adminUserId,
    req.query
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Affiliate payout requests retrieved successfully',
    data: result,
  })
})

  const approveAffiliatePayout = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const { payoutId } = req.params
  const result = await AdminDashboardService.approveAffiliatePayout(
    adminUserId,
    payoutId as string,
    req.body
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Affiliate payout status updated successfully',
    data: result,
  })
})

const getVendorDetails = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id
  const { vendorId } = req.params

  const result = await AdminDashboardService.getVendorDetails(
    adminUserId,
    vendorId as string
  )

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor details retrieved successfully',
    data: result,
  })
})



export const AdminDashboardController = {
  adminDashboardStats,
  getVendorList,
  getGuestCustomerList,
  updateAdminAccountStatus,
  getAffiliatesPerformance,
  getAffiliatePayoutRequests,
  approveAffiliatePayout,
  getVendorDetails,
}
