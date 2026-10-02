import redis from '../../config/redis.config.js'
import { CashoutMethod, CashoutStatus, OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { CreateCashoutPayload } from './cashout.types.js'
import AppError from '../../shared/errors/AppError.js'
import httpStatus from 'http-status'
import { UpdateCashoutSettingsPayload, UpdateCashoutStatusPayload } from './cashout.validation.js'

const getCashoutSetting = async () => {
  
  const cached = await redis.get('cashout_settings')
  if (cached) return JSON.parse(cached)

  const setting = await prisma.cashoutSetting.findFirst({
    orderBy: {
      createdAt: 'desc',
    },
  })

  let result: any = { chargeRate: 2, minimumCashoutAmount: 1000, allowedMethods: ["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER"] }
  if (setting) {
    result = {
      chargeRate: Number(setting.chargeRate),
      minimumCashoutAmount: Number(setting.minimumCashoutAmount),
      allowedMethods: setting.allowedMethods,
    }
  }

  await redis.set('cashout_settings', JSON.stringify(result))
  return result
}

// Update Cashout Settings
const updateCashoutSetting = async (payload: UpdateCashoutSettingsPayload) => {
  const setting = await prisma.cashoutSetting.findFirst({
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (!setting) {
    return prisma.cashoutSetting.create({
      data: {
        chargeRate: payload.chargeRate ?? 2,
        minimumCashoutAmount: payload.minimumCashoutAmount ?? 1000,
        allowedMethods: payload.allowedMethods ?? ["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER"],
      },
    })
  }

  const result = await prisma.cashoutSetting.update({
    where: {
      id: setting.id,
    },
    data: {
      ...(payload.chargeRate !== undefined && {
        chargeRate: payload.chargeRate,
      }),
      ...(payload.minimumCashoutAmount !== undefined && {
        minimumCashoutAmount: payload.minimumCashoutAmount,
      }),
      ...(payload.allowedMethods !== undefined && {
        allowedMethods: payload.allowedMethods,
      }),
    },
  })

  
  await redis.del('cashout_settings')

  return result
}

// Cashout Summary
const getCashoutSummary = async (vendorId: string) => {
  
  const cacheKey = `cashout_summary:${vendorId}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const cashoutSetting = await getCashoutSetting()

  const paidOrderItems = await prisma.orderItem.findMany({
    where: {
      product: {
        vendorId,
      },
      order: {
        status: {
          notIn: [
            OrderStatus.CANCELLED,
            OrderStatus.RETURNED,
            OrderStatus.REFUNDED,
            OrderStatus.FAILED,
          ],
        },
        payment: {
          some: {
            paymentMethod: {
              in: [PaymentMethod.SSLCOMMERZ, PaymentMethod.EPS],
            },
            paymentStatus: PaymentStatus.PAID,
          },
        },
      },
    },
    select: {
      price: true,
      quantity: true,
    },
  })

  const pendingCashoutResult = await prisma.vendorCashout.aggregate({
    where: {
      vendorId,
      status: CashoutStatus.PENDING,
    },
    _sum: {
      totalDeduction: true,
    },
  })

  const completedCashoutResult = await prisma.vendorCashout.aggregate({
    where: {
      vendorId,
      status: CashoutStatus.COMPLETED,
    },
    _sum: {
      totalDeduction: true,
    },
  })

  const grossEarning = paidOrderItems.reduce((sum, item) => {
    return sum + Number(item.price.toString()) * item.quantity
  }, 0)

  const lifetimeEarning = grossEarning - grossEarning * 0.025

  const pendingCashout = Number(pendingCashoutResult._sum.totalDeduction || 0)
  const lifetimeCashout = Number(completedCashoutResult._sum.totalDeduction || 0)

  const availableBalance = lifetimeEarning - pendingCashout - lifetimeCashout
  const withdrawableBalance = availableBalance / (1 + cashoutSetting.chargeRate / 100)

  const latestRequestData = await prisma.vendorCashout.findFirst({
    where: { vendorId },
    orderBy: { requestedAt: 'desc' },
  })

  const latestRequest = latestRequestData
    ? {
        cashoutId: latestRequestData.id,
        requestedAmount: latestRequestData.requestedAmount,
        chargeAmount: latestRequestData.chargeAmount,
        payoutAmount: latestRequestData.payoutAmount,
        totalDeduction: latestRequestData.totalDeduction,
        method: latestRequestData.method,
        status: latestRequestData.status,
        requestedAt: latestRequestData.requestedAt,
      }
    : null

  const result = {
    lifetimeEarning,
    lifetimeCashout,
    pendingCashout,
    availableBalance,
    chargeRate: cashoutSetting.chargeRate,
    withdrawableBalance,
    minimumCashout: cashoutSetting.minimumCashoutAmount,
    hasMinimumCashoutBalance: availableBalance >= cashoutSetting.minimumCashoutAmount,
    latestRequest,
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 10) // 10 seconds cache
  return result
}

// Vendor Make Cashout Request
const createCashout = async (vendorId: string, payload: CreateCashoutPayload) => {
  const { amount, method, accountHolderName, accountNumber } = payload

  const summary = await getCashoutSummary(vendorId)

  if (amount < summary.minimumCashout) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum cashout amount is ${summary.minimumCashout}`
    )
  }

  const existingPendingCashout = await prisma.vendorCashout.findFirst({
    where: {
      vendorId,
      status: CashoutStatus.PENDING,
    },
  })

  if (existingPendingCashout) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You already have a pending cashout request')
  }

  const chargeAmount = (amount * summary.chargeRate) / 100
  const totalDeduction = amount + chargeAmount

  if (totalDeduction > summary.availableBalance) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Insufficient available balance')
  }

  const payoutAmount = amount

  const cashout = await prisma.vendorCashout.create({
    data: {
      vendorId,
      requestedAmount: amount,
      chargeRate: summary.chargeRate,
      chargeAmount,
      payoutAmount,
      totalDeduction,
      method,
      accountHolderName,
      accountNumber,
      status: CashoutStatus.PENDING,
    },
  })

  
  await redis.del(`cashout_summary:${vendorId}`)

  return {
    cashoutId: cashout.id,
    requestedAmount: cashout.requestedAmount,
    chargeAmount: cashout.chargeAmount,
    payoutAmount: cashout.payoutAmount,
    totalDeduction: cashout.totalDeduction,
    method: cashout.method,
    status: cashout.status,
    requestedAt: cashout.requestedAt,
  }
}

// Admin Get All Requested Pending Cashouts With Filter
const getCashoutsForAdmin = async (query: Record<string, unknown>) => {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.max(Number(query.limit) || 10, 1)
  const skip = (page - 1) * limit

  const status = query.status as CashoutStatus | undefined
  const method = query.method as CashoutMethod | undefined
  const searchTerm = query.searchTerm as string | undefined

  const where: Prisma.VendorCashoutWhereInput = {
    ...(status && { status }),
    ...(method && { method }),
    ...(searchTerm && {
      OR: [{ id: searchTerm }, { vendorId: searchTerm }],
    }),
  }

  const [cashouts, total] = await Promise.all([
    prisma.vendorCashout.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        vendorId: true,

        requestedAmount: true,
        chargeAmount: true,
        payoutAmount: true,

        method: true,
        accountHolderName: true,
        accountNumber: true,

        status: true,
        requestedAt: true,

        vendor: {
          select: {
            shopName: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.vendorCashout.count({ where }),
  ])

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: cashouts.map((cashout) => ({
      cashoutId: cashout.id,
      vendorId: cashout.vendorId,
      vendorName: cashout.vendor.user.name,
      vendorEmail: cashout.vendor.user.email,
      shopName: cashout.vendor.shopName,

      requestedAmount: cashout.requestedAmount,
      chargeAmount: cashout.chargeAmount,
      payoutAmount: cashout.payoutAmount,

      method: cashout.method,
      accountHolderName: cashout.accountHolderName,
      accountNumber: cashout.accountNumber,

      status: cashout.status,
      requestedAt: cashout.requestedAt,
    })),
  }
}

const updateCashoutStatus = async (cashoutId: string, payload: UpdateCashoutStatusPayload) => {
  const { status, adminTransactionId, rejectionReason, failureReason } = payload

  const cashout = await prisma.vendorCashout.findUnique({
    where: { id: cashoutId },
  })

  if (!cashout) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cashout request not found')
  }

  if (cashout.status !== CashoutStatus.PENDING) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Only pending cashout can be updated')
  }

  if (status === CashoutStatus.COMPLETED) {
    if (!adminTransactionId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Admin transaction ID is required')
    }

    return prisma.vendorCashout.update({
      where: { id: cashoutId },
      data: {
        status: CashoutStatus.COMPLETED,
        adminTransactionId,
        completedAt: new Date(),
      },
    })
  }

  if (status === CashoutStatus.REJECTED) {
    if (!rejectionReason) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Rejection reason is required')
    }

    return prisma.vendorCashout.update({
      where: { id: cashoutId },
      data: {
        status: CashoutStatus.REJECTED,
        rejectionReason,
        rejectedAt: new Date(),
      },
    })
  }

  if (status === CashoutStatus.FAILED) {
    if (!failureReason) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failure reason is required')
    }

    return prisma.vendorCashout.update({
      where: { id: cashoutId },
      data: {
        status: CashoutStatus.FAILED,
        failureReason,
        failedAt: new Date(),
      },
    })
  }
}

export const CashoutService = {
  getCashoutSetting,
  updateCashoutSetting,
  getCashoutSummary,
  createCashout,
  getCashoutsForAdmin,
  updateCashoutStatus,
}
