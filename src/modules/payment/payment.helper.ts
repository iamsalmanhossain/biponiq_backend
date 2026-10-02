import crypto from 'crypto'
import httpStatus from 'http-status'

import { env } from '../../config/env.js'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { TransactionType } from './payment.types.js'
import { PaymentResultType } from '@prisma/client'

type StoreRedirectData = {
  subDomain: string | null
  customDomain: string | null
}

const RESULT_TOKEN_EXPIRY_HOURS = 2

export const getOrderStoreRedirectData = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      items: {
        take: 1,
        select: {
          product: {
            select: {
              vendor: {
                select: {
                  subDomain: true,
                  customDomain: {
                    select: {
                      domain: true,
                    },
                  },
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

  const vendor = order.items[0]?.product.vendor

  const subDomain = vendor?.subDomain ?? null
  const customDomain = vendor?.customDomain?.domain ?? null

  if (!subDomain && !customDomain) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Order vendor redirect domain not found')
  }

  return {
    orderId,
    subDomain,
    customDomain,
  }
}

export const getPaymentRedirectContext = async (transactionId: string) => {
  const orderPayment = await prisma.payment.findUnique({
    where: {
      transactionId,
    },
    select: {
      transactionId: true,
      orderId: true,
    },
  })

  if (orderPayment) {
    const orderRedirectData = await getOrderStoreRedirectData(orderPayment.orderId)

    return {
      type: TransactionType.ORDER,
      transactionId: orderPayment.transactionId,
      orderId: orderPayment.orderId,
      subDomain: orderRedirectData.subDomain,
      customDomain: orderRedirectData.customDomain,
    }
  }

  const subscriptionPayment = await prisma.subscriptionPayment.findUnique({
    where: {
      transactionId,
    },
    select: {
      transactionId: true,
      subscriptionId: true,
    },
  })

  if (subscriptionPayment) {
    return {
      type: TransactionType.SUBSCRIPTION,
      transactionId: subscriptionPayment.transactionId,
      subscriptionId: subscriptionPayment.subscriptionId,
    }
  }

  throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
}

export const generateResultToken = () => {
  return crypto.randomBytes(32).toString('hex')
}

export const hashResultToken = (token: string) => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const getResultTokenExpiry = () => {
  return new Date(Date.now() + RESULT_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
}

export const issuePaymentResultToken = async (
  transactionType: PaymentResultType,
  transactionId: string
) => {
  const rawToken = generateResultToken()
  const tokenHash = hashResultToken(rawToken)
  const expiresAt = getResultTokenExpiry()

  await prisma.paymentResultToken.upsert({
    where: {
      transactionType_transactionId: {
        transactionType,
        transactionId,
      },
    },
    create: {
      transactionType,
      transactionId,
      tokenHash,
      expiresAt,
    },
    update: {
      tokenHash,
      expiresAt,
    },
  })

  return rawToken
}

export const findPaymentResultTokenContext = async (rawToken: string) => {
  const tokenHash = hashResultToken(rawToken)

  const paymentResultToken = await prisma.paymentResultToken.findUnique({
    where: {
      tokenHash,
    },
    select: {
      transactionType: true,
      transactionId: true,
      expiresAt: true,
    },
  })

  if (!paymentResultToken) {
    return null
  }

  if (paymentResultToken.expiresAt <= new Date()) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Payment result token has expired')
  }

  return {
    transactionType: paymentResultToken.transactionType,
    transactionId: paymentResultToken.transactionId,
  }
}

export const getPaymentResultTokenContext = async (rawToken: string) => {
  const paymentResultTokenContext = await findPaymentResultTokenContext(rawToken)

  if (!paymentResultTokenContext) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid payment result token')
  }

  return paymentResultTokenContext
}

export const getStoreBaseUrl = ({ subDomain, customDomain }: StoreRedirectData) => {
  if (process.env.NODE_ENV === 'development' && env.FRONTEND_STORE_BASE_URL) {
    return env.FRONTEND_STORE_BASE_URL
  }

  const host = customDomain ? customDomain : `${subDomain}.${env.FRONTEND_STORE_ROOT_DOMAIN}`

  return `${env.FRONTEND_STORE_PROTOCOL}://${host}`
}
