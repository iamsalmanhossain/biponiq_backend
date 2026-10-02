import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { activateSubscriptionAfterPayment } from '../subscription/subscription.helper.js'

import { enqueuePaidDomainRegistration } from '../domain/registration/domainRegistration.queue.js'
import type { ProcessPaymentCallbackResult } from './providers/payment-provider.types.js'
import { VendorService } from '../vendor/vendor.service.js'

const isJsonObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const getCompletionGatewayData = (
  paymentMethod: PaymentMethod,
  gatewayData: unknown,
  paymentResult: ProcessPaymentCallbackResult['payment']
) => {
  if (paymentMethod === PaymentMethod.EPS && isJsonObject(gatewayData)) {
    return {
      ...gatewayData,
      paymentResult,
    }
  }

  return paymentResult
}

type LockedSubscriptionPayment = {
  gatewayData: Prisma.JsonValue | null
  paymentStatus: PaymentStatus
}

const lockSubscriptionPayment = async (
  tx: Prisma.TransactionClient,
  subscriptionPaymentId: string
): Promise<LockedSubscriptionPayment> => {
  const [payment] = await tx.$queryRaw<LockedSubscriptionPayment[]>(Prisma.sql`
    SELECT "gatewayData", "paymentStatus"
    FROM "subscription_payments"
    WHERE "id" = ${subscriptionPaymentId}
    FOR UPDATE
  `)

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription payment not found')
  }

  return payment
}

const updateLockedEpsGatewayData = async (
  tx: Prisma.TransactionClient,
  subscriptionPaymentId: string,
  paymentResult: ProcessPaymentCallbackResult['payment'],
  terminalStatus?: PaymentStatus
) => {
  const payment = await lockSubscriptionPayment(tx, subscriptionPaymentId)

  if (terminalStatus && payment.paymentStatus !== PaymentStatus.PENDING) {
    return {
      updated: false,
      paymentStatus: payment.paymentStatus,
    }
  }

  await tx.subscriptionPayment.update({
    where: { id: subscriptionPaymentId },
    data: {
      ...(terminalStatus ? { paymentStatus: terminalStatus } : {}),
      gatewayData: getCompletionGatewayData(PaymentMethod.EPS, payment.gatewayData, paymentResult),
    },
  })

  return {
    updated: true,
    paymentStatus: terminalStatus ?? payment.paymentStatus,
  }
}

const completeSubscriptionPayment = async (
  callbackResult: ProcessPaymentCallbackResult,
  subscriptionPaymentId: string
) => {
  const { payment: paymentResult } = callbackResult

  const subscriptionPayment = await prisma.subscriptionPayment.findUnique({
    where: {
      id: subscriptionPaymentId,
    },
    select: {
      id: true,
      vendorId: true,
      subscriptionId: true,
      amount: true,
      paymentStatus: true,
      paymentMethod: true,
      gatewayData: true,
      couponId: true,
      discountAmount: true,
      purpose: true,
      visitorLimitPackageId: true,
    },
  })

  if (!subscriptionPayment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription payment not found')
  }

  if (subscriptionPayment.paymentStatus === PaymentStatus.PAID) {
    if (subscriptionPayment.purpose === 'VISITOR_LIMIT_TOPUP') {
      return {
        paymentId: subscriptionPayment.id,
        subscriptionId: subscriptionPayment.subscriptionId,
        status: subscriptionPayment.paymentStatus,
        message: 'Payment already processed',
      }
    }

    const processedResult = await activateSubscriptionAfterPayment(subscriptionPayment.id)

    if (processedResult.purchasedDomainId) {
      await enqueuePaidDomainRegistration(processedResult.purchasedDomainId)
    }

    return {
      paymentId: subscriptionPayment.id,
      subscriptionId: subscriptionPayment.subscriptionId,
      status: subscriptionPayment.paymentStatus,
      message: 'Payment already processed',
    }
  }

  if (paymentResult.status === PaymentStatus.FAILED) {
    if (subscriptionPayment.paymentMethod === PaymentMethod.EPS) {
      const failedResult = await prisma.$transaction((tx) =>
        updateLockedEpsGatewayData(
          tx,
          subscriptionPayment.id,
          paymentResult,
          PaymentStatus.FAILED
        )
      )

      if (!failedResult.updated) {
        return {
          paymentId: subscriptionPayment.id,
          subscriptionId: subscriptionPayment.subscriptionId,
          status: failedResult.paymentStatus,
          message: 'Payment already processed',
        }
      }

      return {
        paymentId: subscriptionPayment.id,
        subscriptionId: subscriptionPayment.subscriptionId,
        status: PaymentStatus.FAILED,
      }
    }

    const failedUpdate = await prisma.subscriptionPayment.updateMany({
      where: {
        id: subscriptionPayment.id,
        paymentStatus: PaymentStatus.PENDING,
      },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        gatewayData: getCompletionGatewayData(
          subscriptionPayment.paymentMethod,
          subscriptionPayment.gatewayData,
          paymentResult
        ),
      },
    })

    if (failedUpdate.count === 0) {
      const currentPayment = await prisma.subscriptionPayment.findUnique({
        where: {
          id: subscriptionPayment.id,
        },
        select: {
          paymentStatus: true,
        },
      })

      return {
        paymentId: subscriptionPayment.id,
        subscriptionId: subscriptionPayment.subscriptionId,
        status: currentPayment?.paymentStatus ?? subscriptionPayment.paymentStatus,
        message: 'Payment already processed',
      }
    }

    return {
      paymentId: subscriptionPayment.id,
      subscriptionId: subscriptionPayment.subscriptionId,
      status: PaymentStatus.FAILED,
    }
  }

  if (paymentResult.status === PaymentStatus.CANCELLED) {
    if (subscriptionPayment.paymentMethod === PaymentMethod.EPS) {
      const cancelledResult = await prisma.$transaction((tx) =>
        updateLockedEpsGatewayData(
          tx,
          subscriptionPayment.id,
          paymentResult,
          PaymentStatus.CANCELLED
        )
      )

      if (!cancelledResult.updated) {
        return {
          paymentId: subscriptionPayment.id,
          subscriptionId: subscriptionPayment.subscriptionId,
          status: cancelledResult.paymentStatus,
          message: 'Payment already processed',
        }
      }

      return {
        paymentId: subscriptionPayment.id,
        subscriptionId: subscriptionPayment.subscriptionId,
        status: PaymentStatus.CANCELLED,
      }
    }

    const cancelledUpdate = await prisma.subscriptionPayment.updateMany({
      where: {
        id: subscriptionPayment.id,
        paymentStatus: PaymentStatus.PENDING,
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        gatewayData: getCompletionGatewayData(
          subscriptionPayment.paymentMethod,
          subscriptionPayment.gatewayData,
          paymentResult
        ),
      },
    })

    if (cancelledUpdate.count === 0) {
      const currentPayment = await prisma.subscriptionPayment.findUnique({
        where: {
          id: subscriptionPayment.id,
        },
        select: {
          paymentStatus: true,
        },
      })

      return {
        paymentId: subscriptionPayment.id,
        subscriptionId: subscriptionPayment.subscriptionId,
        status: currentPayment?.paymentStatus ?? subscriptionPayment.paymentStatus,
        message: 'Payment already processed',
      }
    }

    return {
      paymentId: subscriptionPayment.id,
      subscriptionId: subscriptionPayment.subscriptionId,
      status: PaymentStatus.CANCELLED,
    }
  }

  if (paymentResult.status !== PaymentStatus.PAID) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Unsupported payment completion status')
  }

  await prisma.$transaction(async (tx) => {
    if (subscriptionPayment.paymentMethod === PaymentMethod.EPS) {
      await updateLockedEpsGatewayData(tx, subscriptionPayment.id, paymentResult)
    } else {
      await tx.subscriptionPayment.update({
        where: {
          id: subscriptionPayment.id,
        },
        data: {
          gatewayData: getCompletionGatewayData(
            subscriptionPayment.paymentMethod,
            subscriptionPayment.gatewayData,
            paymentResult
          ),
        },
      })
    }
  })

  if (subscriptionPayment.purpose === 'VISITOR_LIMIT_TOPUP') {
    const { VisitorLimitTopupService } = await import('../visitorLimitTopup/visitorLimitTopup.service.js')
    await VisitorLimitTopupService.applyTopupAfterPayment(subscriptionPayment.id)
    return {
      paymentId: subscriptionPayment.id,
      subscriptionId: subscriptionPayment.subscriptionId,
      status: PaymentStatus.PAID,
    }
  }

  const result = await activateSubscriptionAfterPayment(subscriptionPayment.id)

  if (result.purchasedDomainId) {
    await enqueuePaidDomainRegistration(result.purchasedDomainId)
  }

  await VendorService.invalidateVendorProfileCache(result.subscription.vendorId)

  return {
    paymentId: result.payment.id,
    subscriptionId: result.subscription.id,
    status: PaymentStatus.PAID,
  }
}

export const SubscriptionPaymentService = {
  completeSubscriptionPayment,
}
