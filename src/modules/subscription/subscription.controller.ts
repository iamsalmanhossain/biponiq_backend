import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import AppError from '../../shared/errors/AppError.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import catchAsync from '../../shared/utils/catchAsync.js'
import { SubscriptionService } from './subscription.service.js'
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

const createPlan = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.createPlan(req.body)
  ApiResponse.success(res, result, 'Subscription plan created successfully', StatusCodes.CREATED)
})

const getPlansForAdmin = catchAsync(async (_req: Request, res: Response) => {
  const result = await SubscriptionService.getPlansForAdmin()
  ApiResponse.success(res, result, 'Subscription plans retrieved successfully')
})

const getActivePlansForVendor = catchAsync(async (_req: Request, res: Response) => {
  const result = await SubscriptionService.getActivePlansForVendor()
  ApiResponse.success(res, result, 'Subscription plans retrieved successfully')
})

const updatePlan = catchAsync(async (req: Request<{ planId?: string }>, res: Response) => {
  const planId = req.params.planId
  if (!planId) throw new AppError(StatusCodes.BAD_REQUEST, 'planId is required')

  const result = await SubscriptionService.updatePlan(planId, req.body)
  ApiResponse.success(res, result, 'Subscription plan updated successfully')
})

const deletePlan = catchAsync(async (req: Request<{ planId?: string }>, res: Response) => {
  const planId = req.params.planId
  if (!planId) throw new AppError(StatusCodes.BAD_REQUEST, 'planId is required')

  const result = await SubscriptionService.deletePlan(planId)
  ApiResponse.success(res, result, 'Subscription plan deleted successfully')
})

const assignPlanToVendor = catchAsync(
  async (req: Request<{ vendorId?: string }, {}, { planId: string, customDays?: number }>, res: Response) => {
    const vendorId = req.params.vendorId
    const { planId, customDays } = req.body
    
    if (!vendorId) throw new AppError(StatusCodes.BAD_REQUEST, 'vendorId is required')
    if (!planId) throw new AppError(StatusCodes.BAD_REQUEST, 'planId is required')

    const result = await SubscriptionService.assignPlanToVendor(vendorId, planId, customDays)
    ApiResponse.success(res, result, 'Plan assigned to vendor successfully', StatusCodes.OK)
  }
)

const createTrialForVendor = catchAsync(
  async (req: Request<{ vendorId?: string }>, res: Response) => {
    const vendorId = req.params.vendorId
    if (!vendorId) throw new AppError(StatusCodes.BAD_REQUEST, 'vendorId is required')

    const result = await SubscriptionService.createTrialForVendor(vendorId)
    ApiResponse.success(res, result, 'Vendor trial created successfully', StatusCodes.CREATED)
  }
)

const cancelSubscription = catchAsync(async (req, res) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.cancelVendorSubscription(vendorId, req.body)

  ApiResponse.success(
    res,
    result,
    'Subscription cancellation scheduled successfully',
    StatusCodes.OK
  )
})

const checkoutPlan = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.checkoutPlan(vendorId, req.body)

  ApiResponse.success(
    res,
    result,
    'Subscription checkout created successfully',
    StatusCodes.CREATED
  )
})

const getCheckoutDraft = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.getCheckoutDraft(vendorId)

  ApiResponse.success(res, result, 'Checkout draft retrieved successfully')
})

const saveCheckoutDraft = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.saveCheckoutDraft(vendorId, req.body)

  ApiResponse.success(res, result, 'Checkout draft saved successfully')
})

const saveCheckoutDraftDomain = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.saveCheckoutDraftDomain(vendorId, req.body)

  ApiResponse.success(res, result, 'Checkout domain saved successfully')
})

const removeCheckoutDraftDomain = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.removeCheckoutDraftDomain(vendorId)

  ApiResponse.success(res, result, 'Checkout domain removed successfully')
})

const applyCheckoutDraftCoupon = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.applyCheckoutDraftCoupon(vendorId, req.body)

  ApiResponse.success(res, result, 'Checkout coupon applied successfully')
})

const removeCheckoutDraftCoupon = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.removeCheckoutDraftCoupon(vendorId)

  ApiResponse.success(res, result, 'Checkout coupon removed successfully')
})

const downloadSubscriptionReceipt = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)
  const paymentId = req.params.paymentId

  if (!paymentId || Array.isArray(paymentId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Payment ID is required')
  }

  const pdf = await SubscriptionService.downloadSubscriptionReceipt(vendorId, paymentId)

  res.setHeader('Content-Type', 'application/pdf')

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="subscription-receipt-${paymentId}.pdf"`
  )

  res.send(pdf)
})

const getMySubscription = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)
  const result = await SubscriptionService.getVendorSubscription(vendorId)
  ApiResponse.success(res, result, 'Vendor subscription retrieved successfully')
})

const getTrialStatus = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)
  const result = await SubscriptionService.getTrialStatus(vendorId)

  ApiResponse.success(res, result, 'Trial status retrieved successfully')
})

const getVendorSubscriptionForAdmin = catchAsync(
  async (req: Request<{ vendorId?: string }>, res: Response) => {
    const vendorId = req.params.vendorId
    if (!vendorId) throw new AppError(StatusCodes.BAD_REQUEST, 'vendorId is required')



    const result = await SubscriptionService.getVendorSubscriptionForAdmin(vendorId)
    ApiResponse.success(res, result, 'Vendor subscriptions retrieved successfully')
  }
)

const getSubscriptionPaymentResult = catchAsync(async (req: Request, res: Response) => {
  const authorizationHeader = req.headers.authorization

  const resultToken = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : ''

  if (!resultToken) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Payment result token is required')
  }

  const result = await SubscriptionService.getSubscriptionPaymentResult(resultToken)

  ApiResponse.success(res, result, 'Subscription payment result retrieved successfully')
})

// Get Billing History
const getBillingHistory = catchAsync(async (req, res) => {
  const vendorId = await getAuthVendorId(req)

  const result = await SubscriptionService.getBillingHistory(vendorId, req.query)

  ApiResponse.success(res, result, 'Billing history retrieved successfully')
})

export const SubscriptionController = {
  createPlan,
  getPlansForAdmin,
  getActivePlansForVendor,
  updatePlan,
  deletePlan,
  createTrialForVendor,
  assignPlanToVendor,
  cancelSubscription,
  checkoutPlan,

  getCheckoutDraft,
  saveCheckoutDraft,
  saveCheckoutDraftDomain,
  removeCheckoutDraftDomain,

  applyCheckoutDraftCoupon,
  removeCheckoutDraftCoupon,

  downloadSubscriptionReceipt,
  getMySubscription,
  getTrialStatus,
  getVendorSubscriptionForAdmin,
  getSubscriptionPaymentResult,
  getBillingHistory,
}
