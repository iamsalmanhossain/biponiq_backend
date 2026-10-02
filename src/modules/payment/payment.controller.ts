import type { Request, Response } from 'express'
import status from 'http-status'

import { PaymentService } from './payment.service.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import catchAsync from '../../shared/utils/catchAsync.js'
import AppError from '../../shared/errors/AppError.js'

// SSL Success
const paymentSuccess = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.handlePaymentSuccess(req.body)

  return res.redirect(result.redirectUrl)
})

// SSL Fail
const paymentFail = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.handlePaymentFail(req.body)

  return res.redirect(result.redirectUrl)
})

// SSL Cancel
const paymentCancel = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.handlePaymentCancel(req.body)

  return res.redirect(result.redirectUrl)
})

// SSL IPN
const paymentIpn = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.handlePaymentIpn(req.body)

  ApiResponse.success(res, result, 'Payment IPN received', status.OK)
})

// EPS Success
const epsPaymentSuccess = catchAsync(async (req: Request, res: Response) => {
  const transactionId = String(req.query.transactionId ?? '')
  const merchantTransactionId =
    typeof req.query.merchantTransactionId === 'string'
      ? req.query.merchantTransactionId
      : ''

  const result = await PaymentService.handleEpsPaymentSuccess(
    transactionId,
    merchantTransactionId
  )

  return res.redirect(result.redirectUrl)
})

// EPS Fail
const epsPaymentFail = catchAsync(async (req: Request, res: Response) => {
  const transactionId = String(req.query.transactionId ?? '')
  const merchantTransactionId =
    typeof req.query.merchantTransactionId === 'string'
      ? req.query.merchantTransactionId
      : ''

  const result = await PaymentService.handleEpsPaymentFail(transactionId, merchantTransactionId)

  return res.redirect(result.redirectUrl)
})

// EPS Cancel
const epsPaymentCancel = catchAsync(async (req: Request, res: Response) => {
  const transactionId = String(req.query.transactionId ?? '')
  const merchantTransactionId =
    typeof req.query.merchantTransactionId === 'string'
      ? req.query.merchantTransactionId
      : ''

  const result = await PaymentService.handleEpsPaymentCancel(
    transactionId,
    merchantTransactionId
  )

  return res.redirect(result.redirectUrl)
})

// EPS IPN
const epsPaymentIpn = catchAsync(async (req: Request, res: Response) => {
  try {
    await PaymentService.handleEpsPaymentIpn(req.body)

    return res.status(status.OK).json({
      status: 'OK',
      message: 'IPN received and saved successfully',
    })
  } catch (error) {
    if (error instanceof AppError) {
      const message =
        error.statusCode === status.BAD_REQUEST
          ? 'Invalid payload'
          : error.statusCode === status.NOT_FOUND
            ? 'EPS payment not found'
            : error.statusCode === status.CONFLICT
              ? 'Ambiguous EPS payment transaction'
              : 'EPS payment processing failed'

      return res.status(error.statusCode).json({
        status: 'ERROR',
        message,
      })
    }

    return res.status(status.INTERNAL_SERVER_ERROR).json({
      status: 'ERROR',
      message: 'Internal error',
    })
  }
})

export const PaymentController = {
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIpn,
  epsPaymentSuccess,
  epsPaymentFail,
  epsPaymentCancel,
  epsPaymentIpn,
}
