import { Request, Response } from 'express'
import { AdminService } from './admin.service.js'
import { OrderStatus, VendorAccountStatus } from '@prisma/client'
import catchAsync from '../../shared/utils/catchAsync.js'
import { calculatePagination } from '../../shared/pagination/pagination.js'

// get all vendor
const getAllVendor = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, skip } = calculatePagination(req.query)
  const accountStatus = req.query.accountStatus as VendorAccountStatus
  const result = await AdminService.getAllVendor(page, limit, skip, accountStatus)
  res.status(200).json({
    success: true,
    message: 'Get all vendor  successful',
    data: result,
  })
})

// trash vendors
const getTrashVendor = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, skip } = calculatePagination(req.query)
  const accountStatus = req.query.accountStatus as VendorAccountStatus
  const result = await AdminService.getTrashVendor(page, limit, skip)
  res.status(200).json({
    success: true,
    message: 'Get trash vendor  successful',
    data: result,
  })
})

// update vendor status
const updateVendorStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const result = await AdminService.updateVendorStatus(id as string, req.body)
  res.status(200).json({
    success: true,
    message: 'Vendor profile updated successfully',
    data: result,
  })
})

// only admin can delete vendor profile.
const deleteVendor = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id
  const result = await AdminService.deleteVendor(userId as string)
  res.status(200).json({
    success: true,
    message: ' vendor soft delete successful',
    data: result,
  })
})

// restore vendor
const restoreVendor = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id
  const result = await AdminService.restoreVendor(userId as string)
  res.status(200).json({
    success: true,
    message: 'Vendor restored successfully',
    data: result,
  })
})

// vendor stats
const getAllOrders = catchAsync(async (req: Request, res: Response) => {
  const status = req.query.status
  const { page, limit, skip } = calculatePagination(req.query)
  const result = await AdminService.getAllOrders(page, limit, skip, status as OrderStatus)
  res.status(200).json({
    success: true,
    message: 'Get all vendor stats  successful',
    data: result,
  })
})

// vendor stats
const getVendorStats = catchAsync(async (req: Request, res: Response) => {
  const { vendorId } = req.params
  const result = await AdminService.getVendorStats(vendorId as string)
  res.status(200).json({
    success: true,
    message: 'get vendor stats successful',
    result,
  })
})

// admin impersonate vendor — credential ছাড়া vendor account এ login করার জন্য short-lived token generate
const impersonateVendor = catchAsync(async (req: Request, res: Response) => {
  const vendorId = req.params.vendorId as string
  const adminId = req.user.id as string // authenticate middleware থেকে আসে
  const result = await AdminService.impersonateVendor(vendorId, adminId)
  res.status(200).json({
    success: true,
    message: 'Impersonation token generated successfully',
    data: result,
  })
})

// admin panel এ কোন admin কোন vendor account এ কখন login করেছে সেই logs দেখানো
const getImpersonationLogs = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, skip } = calculatePagination(req.query)
  const result = await AdminService.getImpersonationLogs(page, limit, skip)
  res.status(200).json({
    success: true,
    message: 'Impersonation logs fetched successfully',
    data: result,
  })
})

export const AdminController = {
  getAllVendor,
  getTrashVendor,
  updateVendorStatus,
  deleteVendor,
  restoreVendor,
  getAllOrders,
  getVendorStats,
  impersonateVendor,
  getImpersonationLogs,
}
