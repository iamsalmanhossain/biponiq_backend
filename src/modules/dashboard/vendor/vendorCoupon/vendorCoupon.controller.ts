import { Request, Response } from 'express'
import catchAsync from '../../../../shared/utils/catchAsync.js'
import { sendResponse } from '../../../../shared/utils/sendResponse.js'
import { StatusCodes } from 'http-status-codes'
import { VendorCouponService } from './vendorCoupon.service.js'
import { calculatePagination } from '../../../../shared/pagination/pagination.js'

const createVendorCoupon = catchAsync(async (req: Request, res: Response) => {
  const vendorId = req.user!.id
  const result = await VendorCouponService.createVendorCoupon(vendorId, req.body)

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Vendor coupon created successfully',
    data: result,
  })
})

const getVendorCoupons = catchAsync(async (req: Request, res: Response) => {
  const vendorId = req.user!.id;
  const { page, limit, skip } = calculatePagination(req.query);
  const sort = req.query.sort as string;
  const search = req.query.search as string;

  const result = await VendorCouponService.getVendorCoupons(
    vendorId,
    page,
    limit,
    skip,
    sort,
    search
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor coupons retrieved successfully',
    data: result,
  });
});

const getVendorCouponById = catchAsync(async (req: Request, res: Response) => {
  const vendorId = req.user!.id
  const result = await VendorCouponService.getVendorCouponById(vendorId, req.params.couponId as string)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor coupon retrieved successfully',
    data: result,
  })
})

const updateVendorCoupon = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const result = await VendorCouponService.updateVendorCoupon(userId, req.params.couponId as string, req.body)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor coupon updated successfully',
    data: result,
  })
})

const deleteVendorCoupon = catchAsync(async (req: Request, res: Response) => {
  const vendorId = req.user!.id
  const result = await VendorCouponService.deleteVendorCoupon(vendorId, req.params.couponId as string)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Vendor coupon deleted successfully',
    data: result,
  })
})

export const VendorCouponController = {
  createVendorCoupon,
  getVendorCoupons,
  getVendorCouponById,
  updateVendorCoupon,
  deleteVendorCoupon,
}
