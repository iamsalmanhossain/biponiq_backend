import type { Request, Response } from 'express'
import { VendorService } from './vendor.service.js'
import catchAsync from '../../shared/utils/catchAsync.js'
import AppError from '../../shared/errors/AppError.js'
import status from 'http-status'

// single vendor profile

const getMyVendorProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const result = await VendorService.getMyVendorProfile(userId)

  if (!result) {
    res.status(404).json({
      success: false,
      message: 'Vendor profile not found. Please complete your vendor registration.',
    })
    return
  }

  res.status(200).json({
    success: true,
    message: 'Vendor profile retrieved successfully',
    data: result,
  })
})

// update single vendor profile
const updateVendorProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const result = await VendorService.updateVendorProfile(userId, req.body)

  res.status(200).json({
    success: true,
    message: 'Vendor profile updated successfully',
    data: result,
  })
})

// delete profile
const deleteVendor = catchAsync(async (req: Request, res: Response) => {
  //
  const userId = req.user.id
  const result = await VendorService.deleteVendor(userId)
  res.status(200).json({
    success: true,
    message: 'Vendor profile delete successfully',
    data: result,
  })
})

const getPublicVendorProfile = catchAsync(async (req: Request, res: Response) => {
  const { subDomain } = req.params
  const result = await VendorService.getPublicVendorProfile(subDomain as string)

  if (!result) {
    res.status(404).json({
      success: false,
      message: 'Vendor profile not found for this subdomain.',
    })
    return
  }

  res.status(200).json({
    success: true,
    message: 'Public vendor profile retrieved successfully',
    data: result,
  })
})

// upload shop-logo
const uploadShopLogo = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id

  if (!req.file) {
    throw new AppError(status.BAD_REQUEST, 'Shop logo is required')
  }

  const result = await VendorService.uploadShopLogo(userId, req.file)

  res.status(status.OK).json({
    success: true,
    message: 'Shop logo uploaded successfully',
    data: result,
  })
})

// delete shop-logo
const deleteShopLogo = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id

  const result = await VendorService.deleteShopLogo(userId)

  res.status(200).json({
    success: true,
    message: 'Shop logo deleted successfully',
    data: result,
  })
})

export const VendorController = {
  getMyVendorProfile,
  updateVendorProfile,
  deleteVendor,
  getPublicVendorProfile,
  uploadShopLogo,
  deleteShopLogo,
}
