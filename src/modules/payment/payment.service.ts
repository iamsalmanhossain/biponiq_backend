import { PaymentMethod, PaymentResultType, PaymentStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { getPaymentProvider } from './providers/payment-provider.registry.js'
import { PaymentProviderAvailabilityService } from './providers/payment-provider-availability.service.js'
import AppError from '../../shared/errors/AppError.js'
import { TransactionType } from './payment.types.js'
import type { SSLCommerzCallbackPayload } from './providers/sslcommerz/sslcommerz.types.js'
import httpStatus from 'http-status'
import { env } from '../../config/env.js'
import {
  getPaymentRedirectContext,
  getStoreBaseUrl,
  issuePaymentResultToken,
} from './payment.helper.js'
import { OrderPaymentService } from './order-payment.service.js'
import { SubscriptionPaymentService } from './subscription-payment.service.js'
import type {
  EpsBrowserReturnType,
  EpsDecryptedIpnPayload,
  EpsGatewayAttempt,
} from './providers/eps/eps.types.js'
import { verifyEpsPayment } from './providers/eps/eps.client.js'
import { decryptEpsIpnPayload, parseEpsEncryptedIpnPayload } from './providers/eps/eps.crypto.js'
import type {
  OnlinePaymentProvider,
  ProcessPaymentCallbackResult,
} from './providers/payment-provider.types.js'

type EpsGatewayAttempts = {
  attempts: EpsGatewayAttempt[]
}

type ResolvedEpsBrowserPayment =
  | {
      domain: typeof TransactionType.ORDER
      id: string
      transactionId: string
      paymentMethod: PaymentMethod
      amount: unknown
      gatewayData: unknown
    }
  | {
      domain: typeof TransactionType.SUBSCRIPTION
      id: string
      transactionId: string | null
      paymentMethod: PaymentMethod
      amount: unknown
      gatewayData: unknown
    }

type ResolvedEpsIpnPayment =
  | {
      domain: typeof TransactionType.ORDER
      id: string
      transactionId: string
      amount: unknown
      gatewayData: unknown
    }
  | {
      domain: typeof TransactionType.SUBSCRIPTION
      id: string
      transactionId: string | null
      amount: unknown
      gatewayData: unknown
    }

type ValidEpsIpnData = {
  epsTransactionId: string
  merchantTransactionId: string
  amount: number
  status: string
}

// Helper
const getEpsGatewayAttempts = (gatewayData: unknown): EpsGatewayAttempts => {
  if (!gatewayData || typeof gatewayData !== 'object' || Array.isArray(gatewayData)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing EPS payment correlation data')
  }

  const data = gatewayData as Record<string, unknown>
  const epsAttempts = data.epsAttempts

  if (Array.isArray(epsAttempts)) {
    const attempts = epsAttempts.map((attempt) => {
      if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Invalid EPS payment correlation data')
      }

      const attemptData = attempt as Record<string, unknown>
      const merchantTransactionId = attemptData.merchantTransactionId
      const epsTransactionId = attemptData.epsTransactionId

      if (
        typeof merchantTransactionId !== 'string' ||
        !merchantTransactionId.trim() ||
        (epsTransactionId !== undefined && typeof epsTransactionId !== 'string')
      ) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Invalid EPS payment correlation data')
      }

      return {
        merchantTransactionId,
        ...(typeof epsTransactionId === 'string' ? { epsTransactionId } : {}),
      }
    })

    if (
      !attempts.length ||
      new Set(attempts.map((attempt) => attempt.merchantTransactionId)).size !== attempts.length
    ) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid EPS payment correlation data')
    }

    return { attempts }
  }

  const merchantTransactionId = data.merchantTransactionId
  const epsTransactionId = data.epsTransactionId

  if (
    typeof merchantTransactionId !== 'string' ||
    !merchantTransactionId.trim() ||
    (epsTransactionId !== undefined && typeof epsTransactionId !== 'string')
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing EPS payment correlation data')
  }

  return {
    attempts: [
      {
        merchantTransactionId,
        ...(typeof epsTransactionId === 'string' ? { epsTransactionId } : {}),
      },
    ],
  }
}

const getLegacyEpsGatewayAttempt = (gatewayData: unknown): EpsGatewayAttempt | null => {
  if (!gatewayData || typeof gatewayData !== 'object' || Array.isArray(gatewayData)) {
    return null
  }

  const data = gatewayData as Record<string, unknown>
  const merchantTransactionId = data.merchantTransactionId
  const epsTransactionId = data.epsTransactionId

  if (merchantTransactionId === undefined && epsTransactionId === undefined) {
    return null
  }

  if (
    typeof merchantTransactionId !== 'string' ||
    !merchantTransactionId.trim() ||
    (epsTransactionId !== undefined && typeof epsTransactionId !== 'string')
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid EPS payment correlation data')
  }

  return {
    merchantTransactionId,
    ...(typeof epsTransactionId === 'string' ? { epsTransactionId } : {}),
  }
}

const getEpsGatewayAttempt = (
  gatewayData: unknown,
  merchantTransactionId: string
): EpsGatewayAttempt => {
  const { attempts } = getEpsGatewayAttempts(gatewayData)

  if (!merchantTransactionId) {
    const legacyAttempt = getLegacyEpsGatewayAttempt(gatewayData)

    if (legacyAttempt && attempts.some(
      (candidate) => candidate.merchantTransactionId === legacyAttempt.merchantTransactionId
    )) {
      return legacyAttempt
    }

    throw new AppError(httpStatus.BAD_REQUEST, 'Missing EPS payment attempt selector')
  }

  const attempt = attempts.find(
    (candidate) => candidate.merchantTransactionId === merchantTransactionId
  )

  if (!attempt) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS payment attempt mismatch')
  }

  return attempt
}

const getEpsPaymentStatus = (status: unknown): PaymentStatus | null => {
  if (typeof status !== 'string') {
    return null
  }

  switch (status.trim().toLowerCase()) {
    case 'success':
      return PaymentStatus.PAID
    case 'failed':
      return PaymentStatus.FAILED
    case 'cancelled':
      return PaymentStatus.CANCELLED
    default:
      return null
  }
}

const resolveEpsBrowserPayment = async (
  transactionId: string
): Promise<ResolvedEpsBrowserPayment> => {
  const [orderPayment, subscriptionPayment] = await Promise.all([
    prisma.payment.findUnique({
      where: { transactionId },
      select: {
        id: true,
        transactionId: true,
        paymentMethod: true,
        amount: true,
        gatewayData: true,
      },
    }),
    prisma.subscriptionPayment.findUnique({
      where: { transactionId },
      select: {
        id: true,
        transactionId: true,
        paymentMethod: true,
        amount: true,
        gatewayData: true,
      },
    }),
  ])

  if (orderPayment && subscriptionPayment) {
    throw new AppError(httpStatus.CONFLICT, 'Ambiguous EPS payment transaction')
  }

  if (orderPayment) {
    return {
      domain: TransactionType.ORDER,
      ...orderPayment,
    }
  }

  if (subscriptionPayment) {
    return {
      domain: TransactionType.SUBSCRIPTION,
      ...subscriptionPayment,
    }
  }

  throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
}

const resolveEpsIpnPayment = async (
  merchantTransactionId: string
): Promise<ResolvedEpsIpnPayment> => {
  const paymentWhere = {
    paymentMethod: PaymentMethod.EPS,
    OR: [
      {
        gatewayData: {
          path: ['merchantTransactionId'],
          equals: merchantTransactionId,
        },
      },
      {
        gatewayData: {
          path: ['epsAttempts'],
          array_contains: [{ merchantTransactionId }],
        },
      },
    ],
  }

  const [orderPayments, subscriptionPayments] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        transactionId: true,
        amount: true,
        gatewayData: true,
      },
    }),
    prisma.subscriptionPayment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        transactionId: true,
        amount: true,
        gatewayData: true,
      },
    }),
  ])

  if (
    orderPayments.length > 1 ||
    subscriptionPayments.length > 1 ||
    (orderPayments.length === 1 && subscriptionPayments.length === 1)
  ) {
    throw new AppError(httpStatus.CONFLICT, 'Ambiguous EPS payment transaction')
  }

  const [orderPayment] = orderPayments

  if (orderPayment) {
    return {
      domain: TransactionType.ORDER,
      ...orderPayment,
    }
  }

  const [subscriptionPayment] = subscriptionPayments

  if (subscriptionPayment) {
    return {
      domain: TransactionType.SUBSCRIPTION,
      ...subscriptionPayment,
    }
  }

  throw new AppError(httpStatus.NOT_FOUND, 'EPS payment not found')
}

const getValidEpsIpnData = (payload: EpsDecryptedIpnPayload): ValidEpsIpnData => {
  const epsTransactionId = payload.EpsTransactionId
  const merchantTransactionId = payload.MerchantTransactionId
  const amount = Number(payload.TotalAmount)
  const status = payload.Status

  if (
    typeof epsTransactionId !== 'string' ||
    !epsTransactionId.trim() ||
    typeof merchantTransactionId !== 'string' ||
    !merchantTransactionId.trim() ||
    !Number.isFinite(amount) ||
    typeof status !== 'string' ||
    !status.trim()
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid EPS IPN payload')
  }

  return {
    epsTransactionId,
    merchantTransactionId,
    amount,
    status,
  }
}

const initiatePayment = async (
  orderId: string,
  paymentMethod: OnlinePaymentProvider = 'SSLCOMMERZ'
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      totalPrice: true,

      guestCustomer: {
        select: {
          name: true,
          phone: true,
          email: true,

          address: {
            select: {
              area: true,

              district: {
                select: {
                  name: true,
                },
              },

              division: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!order) {
    throw new AppError(httpStatus.NOT_FOUND, 'Order not found')
  }

  await PaymentProviderAvailabilityService.assertPaymentProviderAvailable(paymentMethod)

  const paymentProvider = getPaymentProvider(paymentMethod)

  const transactionId = `TXN-${Date.now()}`

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      transactionId,
      amount: order.totalPrice,
      paymentMethod,
    },
  })

  const customer = order.guestCustomer
  const customerCity = customer.address.district.name
  const customerState = customer.address.division.name
  const customerAddress = `${customer.address.area}, ${customer.address.district.name}, ${customer.address.division.name}`

  const paymentResult = await paymentProvider.initiate({
    transactionId,
    amount: order.totalPrice,
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      city: customerCity,
      state: customerState,
      address: customerAddress,
    },
    ...(paymentMethod === 'EPS'
      ? {
          product: {
            name: 'Biponiq Storefront Order',
            category: 'Ecommerce',
          },
        }
      : {}),
  })

  if (paymentResult.gatewayData) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayData: paymentResult.gatewayData },
    })
  }

  return {
    paymentId: payment.id,
    orderId: order.id,
    transactionId,
    gatewayPageURL: paymentResult.gatewayPageURL,
  }
}

// Reusable Helper
const getPaymentResultRedirectUrl = async (transactionId: string) => {
  const context = await getPaymentRedirectContext(transactionId)

  if (context.type === TransactionType.ORDER) {
    const resultToken = await issuePaymentResultToken(PaymentResultType.ORDER, transactionId)

    const storeBaseUrl = getStoreBaseUrl({
      subDomain: context.subDomain,
      customDomain: context.customDomain,
    })

    return `${storeBaseUrl}/order-result?token=${encodeURIComponent(resultToken)}`
  }

  const resultToken = await issuePaymentResultToken(PaymentResultType.SUBSCRIPTION, transactionId)

  return `${env.FRONTEND_PAYMENT_RESULT_URL}?token=${encodeURIComponent(resultToken)}`
}

// Payment Success
const handlePaymentSuccess = async (payload: SSLCommerzCallbackPayload) => {
  const transactionId = payload.tran_id

  // Verify and process the payment before redirecting
  await processPaymentCallback(payload)

  const redirectUrl = await getPaymentResultRedirectUrl(transactionId)

  return {
    transactionId,
    status: payload.status,
    redirectUrl,
  }
}

// Payment Fail
const handlePaymentFail = async (payload: SSLCommerzCallbackPayload) => {
  const transactionId = payload.tran_id

  // Store the failed payment status before redirecting
  await processPaymentCallback(payload)

  const redirectUrl = await getPaymentResultRedirectUrl(transactionId)

  return {
    transactionId,
    status: payload.status,
    redirectUrl,
  }
}

// Payment Cancel
const handlePaymentCancel = async (payload: SSLCommerzCallbackPayload) => {
  const transactionId = payload.tran_id

  // Store the cancelled payment status before redirecting
  await processPaymentCallback(payload)

  const redirectUrl = await getPaymentResultRedirectUrl(transactionId)

  return {
    transactionId,
    status: payload.status,
    redirectUrl,
  }
}

// Main IPN Handler
const processPaymentCallback = async (payload: SSLCommerzCallbackPayload) => {
  const transactionId = payload.tran_id
  const paymentProvider = getPaymentProvider('SSLCOMMERZ')

  const orderPayment = await prisma.payment.findUnique({
    where: {
      transactionId,
    },
    select: {
      id: true,
      transactionId: true,
      amount: true,
      paymentMethod: true,
    },
  })

  if (orderPayment) {
    if (orderPayment.paymentMethod !== PaymentMethod.SSLCOMMERZ) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment provider mismatch')
    }

    const callbackResult = await paymentProvider.processCallback({
      payload,
      expectedAmount: Number(orderPayment.amount),
      expectedTransactionId: orderPayment.transactionId,
    })

    return OrderPaymentService.completeOrderPayment(callbackResult, orderPayment.id)
  }

  const subscriptionPayment = await prisma.subscriptionPayment.findUnique({
    where: {
      transactionId,
    },
    select: {
      id: true,
      transactionId: true,
      amount: true,
      paymentMethod: true,
    },
  })

  if (!subscriptionPayment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
  }

  if (subscriptionPayment.paymentMethod !== PaymentMethod.SSLCOMMERZ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment provider mismatch')
  }

  if (!subscriptionPayment.transactionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment transaction is missing')
  }

  const callbackResult = await paymentProvider.processCallback({
    payload,
    expectedAmount: Number(subscriptionPayment.amount),
    expectedTransactionId: subscriptionPayment.transactionId,
    amountMismatchMessage: 'Subscription payment amount mismatch',
  })

  return SubscriptionPaymentService.completeSubscriptionPayment(
    callbackResult,
    subscriptionPayment.id
  )
}

const handlePaymentIpn = async (payload: SSLCommerzCallbackPayload) => {
  return processPaymentCallback(payload)
}

// EPS
const handleEpsBrowserReturn = async (
  transactionId: string,
  merchantTransactionId: string,
  returnType: EpsBrowserReturnType
) => {
  if (!transactionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing EPS payment transaction')
  }

  const payment = await resolveEpsBrowserPayment(transactionId)

  if (payment.paymentMethod !== PaymentMethod.EPS) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment provider mismatch')
  }

  const attempt = getEpsGatewayAttempt(payment.gatewayData, merchantTransactionId)
  const verifiedPayment = await verifyEpsPayment(attempt.merchantTransactionId)
  const verifiedAmount = Number(verifiedPayment.TotalAmount)

  if (verifiedPayment.MerchantTransactionId !== attempt.merchantTransactionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS merchant transaction mismatch')
  }

  if (!Number.isFinite(verifiedAmount) || verifiedAmount !== Number(payment.amount)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS payment amount mismatch')
  }

  if (
    attempt.epsTransactionId &&
    verifiedPayment.EpsTransactionId &&
    verifiedPayment.EpsTransactionId !== attempt.epsTransactionId
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS transaction mismatch')
  }

  const paymentStatus = getEpsPaymentStatus(verifiedPayment.Status)

  if (paymentStatus) {
    const callbackResult: ProcessPaymentCallbackResult = {
      payment: {
        transactionId,
        ...(verifiedPayment.EpsTransactionId
          ? { providerTransactionId: verifiedPayment.EpsTransactionId }
          : {}),
        status: paymentStatus,
        amount: verifiedAmount,
      },
    }

    if (payment.domain === TransactionType.ORDER) {
      await OrderPaymentService.completeOrderPayment(callbackResult, payment.id)
    } else {
      await SubscriptionPaymentService.completeSubscriptionPayment(callbackResult, payment.id)
    }
  }

  const redirectUrl = await getPaymentResultRedirectUrl(transactionId)

  return {
    transactionId,
    status: returnType,
    redirectUrl,
  }
}

// EPS Success
const handleEpsPaymentSuccess = async (transactionId: string, merchantTransactionId: string) => {
  return handleEpsBrowserReturn(transactionId, merchantTransactionId, 'SUCCESS')
}

// EPS Fail
const handleEpsPaymentFail = async (transactionId: string, merchantTransactionId: string) => {
  return handleEpsBrowserReturn(transactionId, merchantTransactionId, 'FAIL')
}

// EPS Cancel
const handleEpsPaymentCancel = async (transactionId: string, merchantTransactionId: string) => {
  return handleEpsBrowserReturn(transactionId, merchantTransactionId, 'CANCEL')
}

// EPS IPN
const handleEpsPaymentIpn = async (payload: unknown) => {
  const encryptedPayload = parseEpsEncryptedIpnPayload(payload)

  if (!encryptedPayload) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid EPS IPN payload')
  }

  let decryptedPayload: EpsDecryptedIpnPayload

  try {
    decryptedPayload = decryptEpsIpnPayload(encryptedPayload, env.EPS_IPN_SECRET_KEY)
  } catch {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'EPS IPN decryption failed')
  }

  const ipn = getValidEpsIpnData(decryptedPayload)

  const payment = await resolveEpsIpnPayment(ipn.merchantTransactionId)

  const attempt = getEpsGatewayAttempt(payment.gatewayData, ipn.merchantTransactionId)

  if (ipn.amount !== Number(payment.amount)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS payment amount mismatch')
  }

  const verifiedPayment = await verifyEpsPayment(attempt.merchantTransactionId)
  const verifiedAmount = Number(verifiedPayment.TotalAmount)

  if (verifiedPayment.MerchantTransactionId !== attempt.merchantTransactionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS merchant transaction mismatch')
  }

  if (
    !Number.isFinite(verifiedAmount) ||
    verifiedAmount !== Number(payment.amount) ||
    verifiedAmount !== ipn.amount
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS payment amount mismatch')
  }

  if (
    attempt.epsTransactionId &&
    verifiedPayment.EpsTransactionId &&
    verifiedPayment.EpsTransactionId !== attempt.epsTransactionId
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS transaction mismatch')
  }

  if (
    verifiedPayment.EpsTransactionId &&
    verifiedPayment.EpsTransactionId !== ipn.epsTransactionId
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'EPS transaction mismatch')
  }

  const paymentStatus = getEpsPaymentStatus(verifiedPayment.Status)

  if (!paymentStatus) {
    return {
      processed: true,
      transactionId: payment.transactionId,
      status: ipn.status,
    }
  }

  if (!payment.transactionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing EPS payment transaction')
  }

  const callbackResult: ProcessPaymentCallbackResult = {
    payment: {
      transactionId: payment.transactionId,
      providerTransactionId: verifiedPayment.EpsTransactionId ?? ipn.epsTransactionId,
      status: paymentStatus,
      amount: verifiedAmount,
    },
  }

  if (payment.domain === TransactionType.ORDER) {
    await OrderPaymentService.completeOrderPayment(callbackResult, payment.id)
  } else {
    await SubscriptionPaymentService.completeSubscriptionPayment(callbackResult, payment.id)
  }

  return {
    processed: true,
    transactionId: payment.transactionId,
    status: ipn.status,
  }
}

export const PaymentService = {
  initiatePayment,
  handlePaymentSuccess,
  handlePaymentFail,
  handlePaymentCancel,
  handlePaymentIpn,

  handleEpsPaymentSuccess,
  handleEpsPaymentFail,
  handleEpsPaymentCancel,
  handleEpsPaymentIpn,
}
