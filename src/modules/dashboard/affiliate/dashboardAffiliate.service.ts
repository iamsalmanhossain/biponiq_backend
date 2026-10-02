import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import httpStatus from 'http-status'
import { hashPassword, comparePassword } from '../../../shared/utils/password.js'

const getDashboard = async (affiliateId: string) => {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  let coupons: any[] = []
  let totalCouponUses = 0
  let totalSalesGenerated = 0
  let totalCommissionEarned = 0

  if (affiliate.vendorId) {
    coupons = await prisma.vendorCoupon.findMany({
      where: { affiliateId },
      select: { id: true, usedCount: true, affiliateCommissionType: true, affiliateCommissionValue: true, code: true, discountValue: true, discountType: true }
    })
    totalCouponUses = coupons.reduce((sum, c) => sum + c.usedCount, 0)

    const couponIds = coupons.map(c => c.id)
    const orders = await prisma.order.findMany({
      where: { vendorCouponId: { in: couponIds } },
      select: { totalPrice: true, affiliateEarning: true }
    })
    totalSalesGenerated = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    totalCommissionEarned = orders.reduce((sum, o) => sum + (o.affiliateEarning || 0), 0)
  } else {
    coupons = await prisma.coupon.findMany({
      where: { affiliateId },
      select: { id: true, usedCount: true, affiliateCommissionType: true, affiliateCommissionValue: true, code: true, discountValue: true, discountType: true }
    })
    totalCouponUses = coupons.reduce((sum, c) => sum + c.usedCount, 0)

    const couponIds = coupons.map(c => c.id)
    const payments = await prisma.subscriptionPayment.findMany({
      where: { couponId: { in: couponIds }, paymentStatus: 'PAID' },
      select: { amount: true, affiliateEarning: true }
    })
    totalSalesGenerated = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    totalCommissionEarned = payments.reduce((sum, p) => sum + (p.affiliateEarning || 0), 0)
  }

  const payoutsList = await prisma.affiliatePayout.findMany({
    where: { affiliateId },
    select: { amount: true, status: true }
  })
  const pendingBalance = payoutsList.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + p.amount, 0)
  const completedBalance = payoutsList.filter(p => p.status === 'COMPLETED' || p.status === 'APPROVED' || p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0)
  const availableBalance = totalCommissionEarned - pendingBalance - completedBalance

  return { totalCouponUses, pendingBalance, totalSalesGenerated, totalCommissionEarned, availableBalance, coupons }
}

const getOrders = async (affiliateId: string, query: { page?: number; limit?: number }) => {
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const skip = (page - 1) * limit

  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  if (affiliate.vendorId) {
    const couponIds = await prisma.vendorCoupon.findMany({
      where: { affiliateId },
      select: { id: true }
    })
    const couponIdList = couponIds.map(c => c.id)

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where: { vendorCouponId: { in: couponIdList } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, createdAt: true, totalPrice: true, status: true, affiliateEarning: true,
          vendorCoupon: { select: { affiliateCommissionType: true, affiliateCommissionValue: true } },
          orderItems: { select: { quantity: true, price: true, product: { select: { name: true } } } },
          user: { select: { email: true } },
          guestCustomer: { select: { email: true } }
        }
      }),
      prisma.order.count({ where: { vendorCouponId: { in: couponIdList } } })
    ])

    return { data: orders, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } }
  } else {
    const couponIds = await prisma.coupon.findMany({
      where: { affiliateId },
      select: { id: true }
    })
    const couponIdList = couponIds.map(c => c.id)

    const [payments, total] = await prisma.$transaction([
      prisma.subscriptionPayment.findMany({
        where: { couponId: { in: couponIdList }, paymentStatus: 'PAID' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, createdAt: true, amount: true, paymentStatus: true, affiliateEarning: true,
          coupon: { select: { affiliateCommissionType: true, affiliateCommissionValue: true } },
          vendor: { select: { user: { select: { email: true } } } },
          subscription: { select: { plan: { select: { name: true } } } }
        }
      }),
      prisma.subscriptionPayment.count({ where: { couponId: { in: couponIdList }, paymentStatus: 'PAID' } })
    ])

    const formattedPayments = payments.map(p => ({
      id: p.id, createdAt: p.createdAt, totalPrice: p.amount, status: p.paymentStatus, affiliateEarning: p.affiliateEarning,
      vendorCoupon: p.coupon,
      orderItems: [{ quantity: 1, price: p.amount, product: { name: p.subscription?.plan?.name || 'Subscription Plan' } }],
      user: { email: p.vendor?.user?.email }
    }))

    return { data: formattedPayments, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } }
  }
}

const getPayouts = async (affiliateId: string) => {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  let totalCommissionEarned = 0

  if (affiliate.vendorId) {
    const coupons = await prisma.vendorCoupon.findMany({
      where: { affiliateId },
      select: { id: true }
    })
    const couponIds = coupons.map(c => c.id)
    const orders = await prisma.order.findMany({
      where: { vendorCouponId: { in: couponIds } },
      select: { affiliateEarning: true }
    })
    totalCommissionEarned = orders.reduce((sum, o) => sum + (o.affiliateEarning || 0), 0)
  } else {
    const coupons = await prisma.coupon.findMany({
      where: { affiliateId },
      select: { id: true }
    })
    const couponIds = coupons.map(c => c.id)
    const payments = await prisma.subscriptionPayment.findMany({
      where: { couponId: { in: couponIds }, paymentStatus: 'PAID' },
      select: { affiliateEarning: true }
    })
    totalCommissionEarned = payments.reduce((sum, p) => sum + (p.affiliateEarning || 0), 0)
  }

  const payouts = await prisma.affiliatePayout.findMany({
    where: { affiliateId },
    orderBy: { payoutDate: 'desc' }
  })

  const pendingBalance = payouts
    .filter(p => p.status === 'PENDING')
    .reduce((sum, p) => sum + p.amount, 0)

  const completedBalance = payouts
    .filter(p => p.status === 'COMPLETED' || p.status === 'APPROVED' || p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0)

  const availableBalance = totalCommissionEarned - pendingBalance - completedBalance

  return { availableBalance, payouts }
}

const getCoupons = async (affiliateId: string) => {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  if (affiliate.vendorId) {
    return prisma.vendorCoupon.findMany({
      where: { affiliateId },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxDiscountAmount: true,
        minimumAmount: true,
        startsAt: true,
        expiresAt: true,
        usageLimit: true,
        usedCount: true,
        isActive: true,
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
  } else {
    return prisma.coupon.findMany({
      where: { affiliateId },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxDiscountAmount: true,
        minimumAmount: true,
        startsAt: true,
        expiresAt: true,
        usageLimit: true,
        usedCount: true,
        perUserLimit: true,
        isActive: true,
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
  }
}

const requestPayout = async (affiliateId: string, payload: { amount: number; payoutMethodId: string }) => {
  const method = await prisma.affiliatePayoutMethod.findFirst({
    where: { id: payload.payoutMethodId, affiliateId }
  })
  if (!method) throw new AppError(httpStatus.NOT_FOUND, 'Payout method not found')

  return prisma.affiliatePayout.create({
    data: { affiliateId, amount: payload.amount, methodType: method.methodType }
  })
}

const getProfile = async (affiliateId: string) => {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { id: true, name: true, email: true, phone: true }
  })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')
  return affiliate
}

const updateProfile = async (affiliateId: string, payload: { name?: string; phone?: string }) => {
  return prisma.affiliate.update({
    where: { id: affiliateId },
    data: payload,
    select: { id: true, name: true, email: true, phone: true }
  })
}

const changePassword = async (affiliateId: string, payload: { currentPassword: string; newPassword: string }) => {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  const isMatch = await comparePassword(payload.currentPassword, affiliate.password)
  if (!isMatch) throw new AppError(httpStatus.UNAUTHORIZED, 'Current password is incorrect')

  const hashed = await hashPassword(payload.newPassword)
  await prisma.affiliate.update({ where: { id: affiliateId }, data: { password: hashed } })
  return { message: 'Password changed successfully' }
}

const getPayoutMethods = async (affiliateId: string) => {
  const savedMethods = await prisma.affiliatePayoutMethod.findMany({ where: { affiliateId } })
  const cashoutSetting = await prisma.cashoutSetting.findFirst({ orderBy: { createdAt: 'desc' } })
  const allowedMethods = cashoutSetting?.allowedMethods || ['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER']

  return { savedMethods, allowedMethods }
}

const addPayoutMethod = async (affiliateId: string, payload: any) => {
  return prisma.affiliatePayoutMethod.create({ data: { affiliateId, ...payload } })
}

const deletePayoutMethod = async (affiliateId: string, methodId: string) => {
  const method = await prisma.affiliatePayoutMethod.findFirst({
    where: { id: methodId, affiliateId }
  })
  if (!method) throw new AppError(httpStatus.NOT_FOUND, 'Payout method not found')
  return prisma.affiliatePayoutMethod.delete({ where: { id: methodId } })
}

export const AffiliateDashboardService = {
  getDashboard, getOrders, getPayouts, requestPayout, getCoupons,
  getProfile, updateProfile, changePassword,
  getPayoutMethods, addPayoutMethod, deletePayoutMethod
}
