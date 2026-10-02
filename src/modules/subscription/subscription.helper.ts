import {
  PaymentStatus,
  SubscriptionBillingCycle,
  SubscriptionPlanType,
  VendorSubscriptionStatus,
} from '@prisma/client'
import httpStatus from 'http-status'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { SubscriptionAccessStatus } from '../../types/subscriptionAccessStatus.js'
import {
  createPendingPurchasedDomain,
  CreatePendingPurchasedDomainInput,
} from '../domain/registration/domainRegistration.service.js'

type SubscriptionForAccess = {
  status: VendorSubscriptionStatus
  endDate: Date | null
}

type PlanPriceForValidation = {
  billingCycle: SubscriptionBillingCycle
  price: number
  discountPercent?: number | undefined
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const PENDING_PAYMENT_EXPIRY_MINUTES = 30

const getPendingExpiryTime = () => {
  return new Date(Date.now() - PENDING_PAYMENT_EXPIRY_MINUTES * 60 * 1000)
}

export const cancelExpiredPendingCheckouts = async (vendorId: string) => {
  await prisma.$transaction([
    prisma.vendorSubscription.updateMany({
      where: {
        vendorId,
        status: VendorSubscriptionStatus.PENDING_PAYMENT,
        createdAt: {
          lt: getPendingExpiryTime(),
        },
      },
      data: {
        status: VendorSubscriptionStatus.CANCELLED,
      },
    }),

    prisma.subscriptionPayment.updateMany({
      where: {
        vendorId,
        paymentStatus: PaymentStatus.PENDING,
        createdAt: {
          lt: getPendingExpiryTime(),
        },
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        note: 'AUTO_CANCELLED_PENDING_PAYMENT_EXPIRED',
      },
    }),
  ])
}

export const cancelPendingCheckout = async (subscriptionId: string, note: string) => {
  await prisma.$transaction([
    prisma.vendorSubscription.updateMany({
      where: {
        id: subscriptionId,
        status: VendorSubscriptionStatus.PENDING_PAYMENT,
      },
      data: {
        status: VendorSubscriptionStatus.CANCELLED,
      },
    }),

    prisma.subscriptionPayment.updateMany({
      where: {
        subscriptionId,
        paymentStatus: PaymentStatus.PENDING,
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        note,
      },
    }),
  ])
}

export const cancelOtherPendingCheckouts = async (
  vendorId: string,
  activeSubscriptionId: string
) => {
  await prisma.$transaction([
    prisma.vendorSubscription.updateMany({
      where: {
        vendorId,
        id: {
          not: activeSubscriptionId,
        },
        status: VendorSubscriptionStatus.PENDING_PAYMENT,
      },
      data: {
        status: VendorSubscriptionStatus.CANCELLED,
      },
    }),

    prisma.subscriptionPayment.updateMany({
      where: {
        vendorId,
        paymentStatus: PaymentStatus.PENDING,
        OR: [
          {
            subscriptionId: {
              not: activeSubscriptionId,
            },
          },
          {
            subscriptionId: null,
          },
        ],
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        note: 'CANCELLED_BY_RESUMED_PENDING_PAYMENT',
      },
    }),
  ])
}

export const cancelAllPendingCheckouts = async (vendorId: string, note: string) => {
  await prisma.$transaction([
    prisma.vendorSubscription.updateMany({
      where: {
        vendorId,
        status: VendorSubscriptionStatus.PENDING_PAYMENT,
      },
      data: {
        status: VendorSubscriptionStatus.CANCELLED,
      },
    }),

    prisma.subscriptionPayment.updateMany({
      where: {
        vendorId,
        paymentStatus: PaymentStatus.PENDING,
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        note,
      },
    }),
  ])
}

export const activateSubscriptionAfterPayment = async (subscriptionPaymentId: string) => {
  const payment = await prisma.subscriptionPayment.findUnique({
    where: {
      id: subscriptionPaymentId,
    },
    select: {
      id: true,
      vendorId: true,
      subscriptionId: true,
      amount: true,

      isDomainIncluded: true,
      domain: true,
      domainExtension: true,
      domainRegistrationYears: true,
      domainRegistrationPriceBdt: true,

      paymentStatus: true,
      billingCycle: true,
      couponId: true,
      discountAmount: true,

      subscription: {
        select: {
          id: true,
          vendorId: true,
          planId: true,
          billingCycle: true,
          status: true,
          plan: {
            select: {
              id: true,
              name: true,
              type: true,
              visitorLimit: true,
            },
          },
        },
      },
    },
  })

  if (!payment || !payment.subscription) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription payment not found')
  }

  if (payment.paymentStatus === PaymentStatus.PAID) {
    const purchasedDomain = payment.isDomainIncluded
      ? await prisma.purchasedDomain.findUnique({
          where: {
            subscriptionPaymentId: payment.id,
          },
          select: {
            id: true,
          },
        })
      : null

    return {
      payment,
      subscription: payment.subscription,
      purchasedDomainId: purchasedDomain?.id ?? null,
    }
  }

  const now = new Date()

  const billingCycle =
    payment.subscription.billingCycle ?? payment.billingCycle ?? SubscriptionBillingCycle.MONTHLY

  const selectedPlanPrice = await prisma.subscriptionPlanPrice.findUnique({
    where: {
      planId_billingCycle: {
        planId: payment.subscription.planId,
        billingCycle,
      },
    },
    select: {
      durationDays: true,
    },
  })

  if (!selectedPlanPrice) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Subscription price configuration not found')
  }

  const endDate = addDays(now, selectedPlanPrice.durationDays)

  const domain = payment.domain?.trim()

  const domainExtension = payment.domainExtension?.trim()

  const domainRegistrationYears = payment.domainRegistrationYears

  const domainRegistrationAmount = payment.domainRegistrationPriceBdt

  let pendingDomainRegistration: CreatePendingPurchasedDomainInput | null = null

  if (payment.isDomainIncluded) {
    if (
      !domain ||
      !domainExtension ||
      domainRegistrationYears === null ||
      domainRegistrationYears <= 0 ||
      domainRegistrationAmount === null ||
      !Number.isFinite(domainRegistrationAmount) ||
      domainRegistrationAmount <= 0
    ) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Domain payment snapshot is incomplete')
    }

    pendingDomainRegistration = {
      vendorId: payment.vendorId,
      subscriptionPaymentId: payment.id,

      domain,
      extension: domainExtension,

      registrationYears: domainRegistrationYears,

      registrationAmount: domainRegistrationAmount,
    }
  }

  const totalPaidAmount = Number(payment.amount)

  const domainPaidAmount = pendingDomainRegistration?.registrationAmount ?? 0

  const subscriptionAmountPaid = totalPaidAmount - domainPaidAmount

  if (
    !Number.isFinite(totalPaidAmount) ||
    !Number.isFinite(domainPaidAmount) ||
    domainPaidAmount < 0 ||
    subscriptionAmountPaid < 0
  ) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Invalid subscription payment amount breakdown'
    )
  }

  return prisma.$transaction(async (tx) => {
    // Only one callback can claim and process this payment
    const paymentClaim = await tx.subscriptionPayment.updateMany({
      where: {
        id: payment.id,
        paymentStatus: {
          not: PaymentStatus.PAID,
        },
      },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: now,
      },
    })

    // Another callback already processed the payment
    if (paymentClaim.count === 0) {
      const processedPayment = await tx.subscriptionPayment.findUnique({
        where: {
          id: payment.id,
        },
      })

      const processedSubscription = await tx.vendorSubscription.findUnique({
        where: {
          id: payment.subscription!.id,
        },
        select: {
          id: true,
          vendorId: true,
          planId: true,
          billingCycle: true,
          status: true,
          startDate: true,
          endDate: true,
          paidAt: true,
          amountPaid: true,
          visitorLimit: true,
          createdAt: true,
          updatedAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      })

      const processedPurchasedDomain = payment.isDomainIncluded
        ? await tx.purchasedDomain.findUnique({
            where: {
              subscriptionPaymentId: payment.id,
            },
            select: {
              id: true,
            },
          })
        : null

      if (!processedPayment || !processedSubscription) {
        throw new AppError(httpStatus.NOT_FOUND, 'Processed subscription data not found')
      }

      return {
        payment: processedPayment,
        subscription: processedSubscription,
        purchasedDomainId: processedPurchasedDomain?.id ?? null,
      }
    }

    // Only the winning callback reaches this section
    if (payment.couponId && Number(payment.discountAmount) > 0) {
      const couponUsageResult = await tx.couponUsage.createMany({
        data: [
          {
            couponId: payment.couponId,
            vendorId: payment.vendorId,
            subscriptionPaymentId: payment.id,
            discountAmount: Number(payment.discountAmount),
          },
        ],
        skipDuplicates: true,
      })

      if (couponUsageResult.count > 0) {
        await tx.coupon.update({
          where: {
            id: payment.couponId,
          },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        })
      }
    }
    await tx.vendorSubscription.updateMany({
      where: {
        vendorId: payment.vendorId,
        id: {
          not: payment.subscription!.id,
        },
        status: {
          in: [
            VendorSubscriptionStatus.TRIAL,
            VendorSubscriptionStatus.ACTIVE,
            VendorSubscriptionStatus.PENDING_PAYMENT,
          ],
        },
      },
      data: {
        status: VendorSubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: false,
        cancelledAt: now,
        cancellationReason: 'Replaced by a new subscription',
      },
    })

    const isSpecialPlan =
      payment.subscription!.plan.type === SubscriptionPlanType.FREE_TRIAL ||
      payment.subscription!.plan.type === SubscriptionPlanType.INSTALLMENT
    const visitorLimitSnapshot = isSpecialPlan
      ? null
      : (payment.subscription!.plan.visitorLimit ?? null)

    const updatedSubscription = await tx.vendorSubscription.update({
      where: {
        id: payment.subscription!.id,
      },
      data: {
        status: VendorSubscriptionStatus.ACTIVE,
        startDate: now,
        endDate,
        paidAt: now,
        amountPaid: subscriptionAmountPaid,
        visitorLimit: visitorLimitSnapshot,
      },
      select: {
        id: true,
        vendorId: true,
        planId: true,
        billingCycle: true,
        status: true,
        startDate: true,
        endDate: true,
        paidAt: true,
        amountPaid: true,
        visitorLimit: true,
        createdAt: true,
        updatedAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    let purchasedDomainId: string | null = null

    if (pendingDomainRegistration) {
      const purchasedDomain = await createPendingPurchasedDomain(tx, pendingDomainRegistration)

      purchasedDomainId = purchasedDomain.id
    }

    const updatedPayment = await tx.subscriptionPayment.findUnique({
      where: {
        id: payment.id,
      },
    })

    if (!updatedPayment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Updated subscription payment not found')
    }

    await tx.vendorCheckoutDraft.deleteMany({
      where: {
        vendorId: payment.vendorId,
      },
    })

    return {
      payment: updatedPayment,
      subscription: updatedSubscription,
      purchasedDomainId,
    }
  })
}

export const getVendorSubscriptionAccess = (subscription: SubscriptionForAccess | null) => {
  const now = new Date()
  const graceLimitMs = 24 * 60 * 60 * 1000

  if (!subscription?.endDate) {
    return {
      dbStatus: null,
      accessStatus: 'NO_SUBSCRIPTION' as SubscriptionAccessStatus,
      showExpiryWarning: false,
      expiredAt: null,
      graceEndsAt: null,
      remainingMs: 0,
    }
  }

  const endDate = subscription.endDate
  const graceEndsAt = new Date(endDate.getTime() + graceLimitMs)
  const remainingMs = Math.max(graceEndsAt.getTime() - now.getTime(), 0)

  if (endDate > now) {
    return {
      dbStatus: subscription.status,
      accessStatus: subscription.status === 'TRIAL' ? 'TRIAL' : 'ACTIVE',
      showExpiryWarning: false,
      expiredAt: null,
      graceEndsAt: null,
      remainingMs: 0,
    }
  }

  if (graceEndsAt > now) {
    return {
      dbStatus: subscription.status,
      accessStatus: 'EXPIRED_GRACE' as SubscriptionAccessStatus,
      showExpiryWarning: true,
      expiredAt: endDate,
      graceEndsAt,
      remainingMs,
    }
  }

  return {
    dbStatus: subscription.status,
    accessStatus: 'EXPIRED_BLOCKED' as SubscriptionAccessStatus,
    showExpiryWarning: false,
    expiredAt: endDate,
    graceEndsAt,
    remainingMs: 0,
  }
}

export const getExpectedPlanPrice = (
  monthlyPrice: number,
  billingCycle: SubscriptionBillingCycle,
  discountPercent = 0
) => {
  const multiplierMap = {
    [SubscriptionBillingCycle.MONTHLY]: 1,
    [SubscriptionBillingCycle.SIX_MONTHS]: 6,
    [SubscriptionBillingCycle.YEARLY]: 12,
  }

  const baseAmount = monthlyPrice * multiplierMap[billingCycle]
  const discountAmount = (baseAmount * discountPercent) / 100

  return Math.round(baseAmount - discountAmount)
}

export const validatePlanPrices = (prices: PlanPriceForValidation[]) => {
  const monthlyPriceOption = prices.find(
    (price) => price.billingCycle === SubscriptionBillingCycle.MONTHLY
  )

  if (!monthlyPriceOption) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Monthly billing option is required')
  }

  for (const priceOption of prices) {
    const expectedPrice = getExpectedPlanPrice(
      monthlyPriceOption.price,
      priceOption.billingCycle,
      priceOption.discountPercent ?? 0
    )

    if (priceOption.price !== expectedPrice) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Expected price for ${priceOption.billingCycle} is ${expectedPrice}, but received ${priceOption.price}.`
      )
    }
  }
}
