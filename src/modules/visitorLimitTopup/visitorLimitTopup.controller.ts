import { Request, Response } from 'express'
import catchAsync from '../../shared/utils/catchAsync.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import { StatusCodes } from 'http-status-codes'
import { VisitorLimitTopupService } from './visitorLimitTopup.service.js'
import AppError from '../../shared/errors/AppError.js'
import { prisma } from '../../lib/prisma.js'

const getAuthVendorId = async (req: Request) => {
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Unauthorized vendor')
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor profile not found')
  }

  return vendor.id
}

// Admin handlers
const createPackage = catchAsync(async (req: Request, res: Response) => {
  const result = await VisitorLimitTopupService.createPackage(req.body)
  ApiResponse.success(res, result, 'Topup package created successfully', StatusCodes.CREATED)
})

const updatePackage = catchAsync(async (req: Request, res: Response) => {
  const { packageId } = req.params
  if (!packageId) throw new AppError(StatusCodes.BAD_REQUEST, 'packageId is required')

  const result = await VisitorLimitTopupService.updatePackage(packageId as string, req.body)
  ApiResponse.success(res, result, 'Topup package updated successfully')
})

const deletePackage = catchAsync(async (req: Request, res: Response) => {
  const { packageId } = req.params
  if (!packageId) throw new AppError(StatusCodes.BAD_REQUEST, 'packageId is required')

  const result = await VisitorLimitTopupService.deletePackage(packageId as string)
  ApiResponse.success(res, result, 'Topup package deleted successfully')
})

const getAllPackagesForAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await VisitorLimitTopupService.getAllPackagesForAdmin()
  ApiResponse.success(res, result, 'Topup packages retrieved successfully')
})

// Vendor / Public handlers
const getPackages = catchAsync(async (req: Request, res: Response) => {
  const result = await VisitorLimitTopupService.getPackages()
  ApiResponse.success(res, result, 'Visitor limit packages retrieved successfully')
})

const checkout = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)
  const { packageId, paymentMethod } = req.body
  if (!packageId) throw new AppError(StatusCodes.BAD_REQUEST, 'packageId is required')

  const result = await VisitorLimitTopupService.checkout(vendorId, packageId, paymentMethod)

  ApiResponse.success(res, result, 'Checkout initialized successfully')
})

export const VisitorLimitTopupController = {
  createPackage,
  updatePackage,
  deletePackage,
  getAllPackagesForAdmin,
  getPackages,
  checkout,
}
