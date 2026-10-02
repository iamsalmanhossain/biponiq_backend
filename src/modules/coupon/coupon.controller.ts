import { Request, Response } from 'express'
import status from 'http-status'
import catchAsync from '../../shared/utils/catchAsync.js'
import { CouponService } from './coupon.service.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'

const createCoupon = catchAsync(async (req: Request, res: Response) => {
  const result = await CouponService.createCoupon(req.body)

  ApiResponse.success(res, result, 'Coupon created successfully', status.CREATED)
})

const getAllCoupons = catchAsync(async (req: Request, res: Response) => {
  const result = await CouponService.getAllCoupons(req.query)

  ApiResponse.success(res, result, 'Coupons retrieved successfully', status.OK)
})

const getCouponById = catchAsync(async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string

  const result = await CouponService.getCouponById(couponId)

  ApiResponse.success(res, result, 'Coupon retrieved successfully', status.OK)
})

const updateCoupon = catchAsync(async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string

  const result = await CouponService.updateCoupon(couponId, req.body)

  ApiResponse.success(res, result, 'Coupon updated successfully', status.OK)
})

// Update Coupon Status
const updateCouponStatus = catchAsync(async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string
  const { isActive } = req.body

  const result = await CouponService.updateCouponStatus(couponId, isActive)

  ApiResponse.success(
    res,
    result,
    `Coupon ${isActive ? 'activated' : 'deactivated'} successfully`,
    status.OK
  )
})

// Validate Coupon
const validateCoupon = catchAsync(async (req: Request, res: Response) => {
  const vendorId = req.user.vendorId as string

  const result = await CouponService.validateCoupon(vendorId, req.body)

  ApiResponse.success(res, result, 'Coupon validated successfully', status.OK)
})

// Archive Coupon
const archiveCoupon = catchAsync(async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string

  const result = await CouponService.archiveCoupon(couponId)

  ApiResponse.success(res, result, 'Coupon archived successfully', status.OK)
})

// Delete Coupon
const deleteCoupon = catchAsync(async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string

  const result = await CouponService.deleteCoupon(couponId)

  ApiResponse.success(res, result, 'Coupon deleted successfully', status.OK)
})

const getPublicCouponDetails = catchAsync(async (req: Request, res: Response) => {
  const code = req.params.code as string

  const result = await CouponService.getPublicCouponDetails(code)

  ApiResponse.success(res, result, 'Public coupon details retrieved successfully', status.OK)
})

export const CouponController = {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  updateCouponStatus,
  validateCoupon,
  archiveCoupon,
  deleteCoupon,
  getPublicCouponDetails,
}
