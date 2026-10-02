import { prisma } from '../../../../lib/prisma.js'
import AppError from '../../../../shared/errors/AppError.js'
import httpStatus from 'http-status'

const getAffiliates = async (vendorId: string) => {
  return prisma.affiliate.findMany({
    where: { vendorId },
    include: {
      coupons: { select: { code: true, usedCount: true } },
      payouts: { select: { amount: true, status: true } }
    }
  })
}

const getAffiliateOrders = async (vendorId: string, affiliateId: string, query: any) => {
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const skip = (page - 1) * limit

  const affiliate = await prisma.affiliate.findFirst({ where: { id: affiliateId, vendorId } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found or does not belong to you')

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
      orderBy: { createdAt: 'desc' }
    }),
    prisma.order.count({ where: { vendorCouponId: { in: couponIdList } } })
  ])

  return { data: orders, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } }
}

const approvePayout = async (vendorId: string, payoutId: string, payload: { status: string; gatewayResponseCode?: string }) => {
  const payout = await prisma.affiliatePayout.findFirst({
    where: { id: payoutId, affiliate: { vendorId } },
    include: { affiliate: { include: { payoutMethods: true } } }
  })

  if (!payout) throw new AppError(httpStatus.NOT_FOUND, 'Payout request not found')
  if (payout.status !== 'PENDING') throw new AppError(httpStatus.BAD_REQUEST, 'Payout is already processed')

  if (payload.status === 'PAID') {
    // INTERNAL PAYMENT GATEWAY LOGIC
    // E.g., const response = await InternalPaymentGateway.transfer({ amount: payout.amount, method: payout.methodType })
    
    // Simulate gateway transaction ID for now
    const gatewayTransactionId = `TXN-${Date.now()}`

    return prisma.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: 'PAID',
        gatewayTransactionId,
        gatewayResponse: payload.gatewayResponseCode || 'SUCCESS'
      }
    })
  } else {
    return prisma.affiliatePayout.update({
      where: { id: payoutId },
      data: { status: 'REJECTED', gatewayResponse: payload.gatewayResponseCode || 'REJECTED_BY_VENDOR' }
    })
  }
}

export const VendorAffiliateService = {
  getAffiliates, getAffiliateOrders, approvePayout
}
