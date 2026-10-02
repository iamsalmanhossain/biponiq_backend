import { CourierProvider } from '@prisma/client'
import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '../../shared/errors/AppError.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import catchAsync from '../../shared/utils/catchAsync.js'
import { CourierService } from './courier.service.js'

const getVendorIdFromReq = (req: Request): string => {
  const vendorId = req.currentVendor?.id || req.user?.id
  if (!vendorId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Unauthorized vendor request')
  }
  return vendorId
}

const saveCredentials = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const result = await CourierService.saveCredentials(vendorId, req.body)
  ApiResponse.success(
    res,
    result,
    'Courier credentials saved successfully',
    StatusCodes.OK
  )
})

const getVendorCouriers = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const result = await CourierService.getVendorCouriers(vendorId)
  ApiResponse.success(
    res,
    result,
    'Vendor couriers retrieved successfully',
    StatusCodes.OK
  )
})

const getAvailableCouriers = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const result = await CourierService.getAvailableCouriersForVendor(vendorId)
  ApiResponse.success(
    res,
    result,
    'Available couriers retrieved successfully',
    StatusCodes.OK
  )
})

const deleteCredentials = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const provider = req.params.provider as CourierProvider
  const result = await CourierService.deleteCredentials(vendorId, provider)
  ApiResponse.success(
    res,
    result,
    'Courier credentials deleted successfully',
    StatusCodes.OK
  )
})

const createOrder = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const { provider, ...orderPayload } = req.body
  const result = await CourierService.createOrder(
    vendorId,
    provider as CourierProvider,
    orderPayload
  )
  const { success, ...cleanData } = result
  ApiResponse.success(
    res,
    { provider, ...cleanData },
    'Courier order created successfully',
    StatusCodes.CREATED
  )
})


const trackParcel = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const provider = req.params.provider as CourierProvider
  const trackingCodeOrCid = req.params.consignmentId as string
  const result = await CourierService.checkDeliveryStatus(
    vendorId,
    provider,
    trackingCodeOrCid
  )
  ApiResponse.success(
    res,
    result,
    'Parcel tracking status retrieved successfully',
    StatusCodes.OK
  )
})

const getBalance = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const provider = req.params.provider as CourierProvider
  const result = await CourierService.getBalance(vendorId, provider)
  ApiResponse.success(
    res,
    result,
    'Courier balance retrieved successfully',
    StatusCodes.OK
  )
})

const getCourierOrders = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const result = await CourierService.getCourierOrders(vendorId, req.query as any)
  ApiResponse.success(
    res,
    result,
    'Courier orders retrieved successfully',
    StatusCodes.OK
  )
})

const getCourierOrderById = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const result = await CourierService.getCourierOrderById(vendorId, req.params.id as string)
  ApiResponse.success(
    res,
    result,
    'Courier order retrieved successfully',
    StatusCodes.OK
  )
})

const getCourierOrdersByOrderId = catchAsync(async (req: Request, res: Response) => {
  const vendorId = getVendorIdFromReq(req)
  const result = await CourierService.getCourierOrdersByOrderId(
    vendorId,
    req.params.orderId as string
  )
  ApiResponse.success(
    res,
    result,
    'Courier orders for order retrieved successfully',
    StatusCodes.OK
  )
})

export const CourierController = {
  saveCredentials,
  getVendorCouriers,
  getAvailableCouriers,
  deleteCredentials,
  createOrder,
  trackParcel,
  getBalance,
  getCourierOrders,
  getCourierOrderById,
  getCourierOrdersByOrderId,
}

