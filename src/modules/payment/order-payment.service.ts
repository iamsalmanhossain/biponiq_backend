import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { ProductService } from '../product/product.service.js'
import type { ProcessPaymentCallbackResult } from './providers/payment-provider.types.js'

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

type LockedOrderPayment = {
  id: string
  orderId: string
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  gatewayData: Prisma.JsonValue | null
}

const lockOrderPayment = async (
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<LockedOrderPayment> => {
  const [payment] = await tx.$queryRaw<LockedOrderPayment[]>(Prisma.sql`
    SELECT "id", "orderId", "paymentMethod", "paymentStatus", "gatewayData"
    FROM "payments"
    WHERE "id" = ${paymentId}
    FOR UPDATE
  `)

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Order payment not found')
  }

  return payment
}

const completeOrderPayment = async (
  callbackResult: ProcessPaymentCallbackResult,
  paymentId: string
) => {
  const { payment: paymentResult } = callbackResult

  if (paymentResult.status !== PaymentStatus.PAID) {
    if (
      paymentResult.status !== PaymentStatus.FAILED &&
      paymentResult.status !== PaymentStatus.CANCELLED
    ) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Unsupported payment completion status')
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await lockOrderPayment(tx, paymentId)

    if (payment.paymentStatus === PaymentStatus.PAID) {
      return {
        alreadyProcessed: true,
        orderId: payment.orderId,
        status: payment.paymentStatus,
      }
    }

    const gatewayData = getCompletionGatewayData(
      payment.paymentMethod,
      payment.gatewayData,
      paymentResult
    )

    if (
      paymentResult.status === PaymentStatus.FAILED ||
      paymentResult.status === PaymentStatus.CANCELLED
    ) {
      if (payment.paymentStatus !== PaymentStatus.PENDING) {
        return {
          alreadyProcessed: true,
          orderId: payment.orderId,
          status: payment.paymentStatus,
        }
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          paymentStatus: paymentResult.status,
          gatewayData,
        },
      })

      return {
        alreadyProcessed: false,
        orderId: payment.orderId,
        status: paymentResult.status,
      }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentDate: new Date(),
        gatewayData,
      },
    })

    const order = await tx.order.findUnique({
      where: {
        id: payment.orderId,
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (!order) {
      throw new AppError(httpStatus.NOT_FOUND, 'Order not found')
    }

    if (order.status !== OrderStatus.CONFIRMED) {
      await tx.order.update({
        where: {
          id: payment.orderId,
        },
        data: {
          status: OrderStatus.CONFIRMED,
        },
      })

      await ProductService.reduceStockAfterCompletedOrder(payment.orderId, tx)
    }

    return {
      alreadyProcessed: false,
      orderId: order.id,
      status: PaymentStatus.PAID,
    }
  })

  return {
    paymentId,
    orderId: result.orderId,
    status: result.status,
    message: result.alreadyProcessed ? 'Payment already processed' : undefined,
  }
}

export const OrderPaymentService = {
  completeOrderPayment,
}
