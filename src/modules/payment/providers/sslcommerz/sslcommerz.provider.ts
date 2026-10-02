import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  NormalizedPaymentResult,
  PaymentCallbackProcessor,
  PaymentProvider,
  PaymentVerifier,
  ProcessPaymentCallbackInput,
  ProcessPaymentCallbackResult,
} from '../payment-provider.types.js'

import type { SSLCommerzCallbackPayload, SSLCommerzVerificationInput } from './sslcommerz.types.js'

import { initiateSslcommerzPayment, validateSslcommerzPayment } from './sslcommerz.client.js'

import httpStatus from 'http-status'
import AppError from '../../../../shared/errors/AppError.js'

const initiate = async (input: InitiatePaymentInput): Promise<InitiatePaymentResult> => {
  return initiateSslcommerzPayment({
    transactionId: input.transactionId,
    amount: input.amount,
    customerName: input.customer.name,
    customerEmail: input.customer.email,
    customerPhone: input.customer.phone,
    customerAddress: input.customer.address,
    customerCity: input.customer.city,
    customerState: input.customer.state,
  })
}

const verify = async (input: SSLCommerzVerificationInput): Promise<NormalizedPaymentResult> => {
  const { payload, expectedAmount, expectedTransactionId, amountMismatchMessage } = input

  if (payload.status !== 'VALID') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid SSLCommerz payment status')
  }

  if (!payload.val_id) {
    throw new AppError(httpStatus.BAD_REQUEST, 'SSLCommerz validation ID is missing')
  }

  const validationResponse = await validateSslcommerzPayment(payload.val_id)

  const isSuccessfulValidation =
    validationResponse.status === 'VALID' || validationResponse.status === 'VALIDATED'

  if (!isSuccessfulValidation) {
    throw new AppError(httpStatus.BAD_REQUEST, 'SSLCommerz payment validation failed')
  }

  const verifiedTransactionId =
    typeof validationResponse.tran_id === 'string' ? validationResponse.tran_id.trim() : ''

  if (!expectedTransactionId || verifiedTransactionId !== expectedTransactionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'SSLCommerz payment transaction mismatch')
  }

  const paidAmount = Number(validationResponse.amount)

  if (Math.abs(paidAmount - expectedAmount) > 0.01) {
    throw new AppError(httpStatus.BAD_REQUEST, amountMismatchMessage)
  }

  return {
    transactionId: expectedTransactionId,
    status: 'PAID',
    amount: paidAmount,
    currency:
      typeof validationResponse.currency === 'string'
        ? validationResponse.currency
        : payload.currency,
  }
}

const processCallback = async ({
  payload,
  expectedAmount,
  expectedTransactionId,
  amountMismatchMessage,
}: ProcessPaymentCallbackInput<SSLCommerzCallbackPayload>): Promise<ProcessPaymentCallbackResult> => {
  if (payload.status === 'FAILED') {
    return {
      payment: {
        transactionId: payload.tran_id,
        status: 'FAILED',
        amount: expectedAmount,
        ...(payload.currency ? { currency: payload.currency } : {}),
      },
    }
  }

  if (payload.status === 'CANCELLED') {
    return {
      payment: {
        transactionId: payload.tran_id,
        status: 'CANCELLED',
        amount: expectedAmount,
        ...(payload.currency ? { currency: payload.currency } : {}),
      },
    }
  }

  const verifiedPayment = await verify({
    payload,
    expectedAmount,
    expectedTransactionId,
    amountMismatchMessage: amountMismatchMessage ?? 'Payment amount mismatch',
  })

  return {
    payment: verifiedPayment,
  }
}

export const sslCommerzProvider = {
  method: 'SSLCOMMERZ',
  initiate,
  verify,
  processCallback,
} satisfies PaymentProvider &
  PaymentVerifier<SSLCommerzVerificationInput> &
  PaymentCallbackProcessor<SSLCommerzCallbackPayload>
