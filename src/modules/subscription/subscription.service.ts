import { StatusCodes } from 'http-status-codes'
import {
  PaymentMethod,
  PaymentResultType,
  PaymentStatus,
  Prisma,
  PurchasedDomainStatus,
  SubscriptionBillingCycle,
  SubscriptionPaymentPurpose,
  SubscriptionPlanType,
  VendorSubscriptionStatus,
} from '@prisma/client'

import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../shared/errors/checkoutErrorCodes.js'
import type {
  ApplyCheckoutDraftCoupon,
  CancelSubscription,
  CheckoutSubscription,
  CreateSubscriptionPlan,
  SaveCheckoutDraft,
  SaveCheckoutDraftDomain,
  UpdateSubscriptionPlan,
} from './subscription.validation.js'
import { getPaymentProvider } from '../payment/providers/payment-provider.registry.js'
import { PaymentProviderAvailabilityService } from '../payment/providers/payment-provider-availability.service.js'
import {
  cancelAllPendingCheckouts,
  cancelExpiredPendingCheckouts,
  cancelOtherPendingCheckouts,
  cancelPendingCheckout,
  getVendorSubscriptionAccess,
  validatePlanPrices,
} from './subscription.helper.js'

import {
  checkoutDraftPaymentSelect,
  pendingCheckoutPaymentSelect,
  publicSubscriptionPlanSelect,
  subscriptionPaymentSelect,
  subscriptionPlanPricePublicSelect,
  subscriptionPlanPriceSelect,
} from './subscription.select.js'
import { generateSubscriptionReceiptPdf } from './subscription.receipt.js'
import { CouponService } from '../coupon/coupon.service.js'
import { getPaymentResultTokenContext } from '../payment/payment.helper.js'
import { DomainQuoteService } from '../domain/quote/domainQuote.service.js'
import {
  buildSubscriptionPaymentDomainData,
  clearCheckoutDraftDomainData,
  clearVendorCheckoutDraftDomainData,
  ensureVendorCanPurchaseDomain,
  getCheckoutDraftExpiryTime,
  isSameSubscriptionPaymentDomain,
  revalidateCheckoutDomainQuote,
} from './subscription.checkout.helper.js'
import { DomainRegistrantService } from '../domain/registrant/domainRegistrant.service.js'
import {
  assertManagedDomainPurchaseEnabled,
  isManagedDomainPurchaseEnabled,
} from '../../shared/errors/managedDomainPurchase.guard.js'
import type { OnlinePaymentProvider } from '../payment/providers/payment-provider.types.js'

import type { EpsGatewayAttempt } from '../payment/providers/eps/eps.types.js'
import redis from '../../config/redis.config.js'
import { VendorService } from '../vendor/vendor.service.js'

const getEpsGatewayAttempts = (gatewayData: unknown): EpsGatewayAttempt[] => {
  if (gatewayData === null || gatewayData === undefined) {
    return []
  }

  if (typeof gatewayData !== 'object' || Array.isArray(gatewayData)) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid EPS payment correlation data')
  }

  const data = gatewayData as Record<string, unknown>
  const epsAttempts = data.epsAttempts

  if (Array.isArray(epsAttempts)) {
    const attempts = epsAttempts.map((attempt) => {
      if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid EPS payment correlation data')
      }

      const attemptData = attempt as Record<string, unknown>
      const merchantTransactionId = attemptData.merchantTransactionId
      const epsTransactionId = attemptData.epsTransactionId

      if (
        typeof merchantTransactionId !== 'string' ||
        !merchantTransactionId.trim() ||
        (epsTransactionId !== undefined && typeof epsTransactionId !== 'string')
      ) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid EPS payment correlation data')
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
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid EPS payment correlation data')
    }

    return attempts
  }

  const merchantTransactionId = data.merchantTransactionId
  const epsTransactionId = data.epsTransactionId

  if (
    typeof merchantTransactionId !== 'string' ||
    !merchantTransactionId.trim() ||
    (epsTransactionId !== undefined && typeof epsTransactionId !== 'string')
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid EPS payment correlation data')
  }

  return [
    {
      merchantTransactionId,
      ...(typeof epsTransactionId === 'string' ? { epsTransactionId } : {}),
    },
  ]
}

const appendEpsGatewayAttempt = async (paymentId: string, gatewayData: unknown) => {
  const [newAttempt] = getEpsGatewayAttempts(gatewayData)

  if (!newAttempt) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Missing EPS payment correlation data')
  }

  const result = await prisma.$transaction(async (tx) => {
    const [payment] = await tx.$queryRaw<
      Array<{
        gatewayData: Prisma.JsonValue | null
        paymentStatus: PaymentStatus
      }>
    >(Prisma.sql`
      SELECT "gatewayData", "paymentStatus"
      FROM "subscription_payments"
      WHERE "id" = ${paymentId}
      FOR UPDATE
    `)

    if (!payment) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Subscription payment not found')
    }

    const attempts = getEpsGatewayAttempts(payment.gatewayData)

    if (
      !attempts.some(
        (attempt) => attempt.merchantTransactionId === newAttempt.merchantTransactionId
      )
    ) {
      const existingGatewayData =
        payment.gatewayData &&
        typeof payment.gatewayData === 'object' &&
        !Array.isArray(payment.gatewayData)
          ? (payment.gatewayData as Record<string, Prisma.JsonValue>)
          : {}

      await tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
          gatewayData: {
            ...existingGatewayData,
            epsAttempts: [...attempts, newAttempt],
          } as Prisma.InputJsonValue,
        },
      })
    }

    return {
      paymentStatus: payment.paymentStatus,
    }
  })

  if (result.paymentStatus !== PaymentStatus.PENDING) {
    throw new AppError(StatusCodes.CONFLICT, 'EPS payment is no longer pending')
  }
}

const assertManagedDomainPurchaseEnabledForCheckout = async (vendorId: string) => {
  try {
    await assertManagedDomainPurchaseEnabled()
  } catch (error) {
    if (error instanceof AppError && error.code === CHECKOUT_ERROR_CODES.DOMAIN_PURCHASE_DISABLED) {
      await clearVendorCheckoutDraftDomainData(vendorId)
    }

    throw error
  }
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const mostPopularPlanTypes = new Set<SubscriptionPlanType>([
  SubscriptionPlanType.STANDARD,
  SubscriptionPlanType.MEDIUM,
  SubscriptionPlanType.PREMIUM,
])

const assertMostPopularEligibility = (type: SubscriptionPlanType, isActive: boolean) => {
  if (!isActive || !mostPopularPlanTypes.has(type)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Only active paid subscription plans can be marked Most Popular'
    )
  }
}

const getVendorOrThrow = async (vendorId: string) => {
  if (!vendorId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Vendor id is required')
  }

  const vendor = await prisma.vendor.findFirst({
    where: {
      OR: [
        { id: vendorId },
        { vendorCode: vendorId },
        { user: { email: vendorId } }
      ]
    },
    select: {
      id: true,
      shopName: true,
      accountStatus: true,

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
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  })

  if (!vendor) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  }

  if (vendor.accountStatus !== VendorSubscriptionStatus.ACTIVE) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Vendor account is not active')
  }

  return vendor
}

const getPlanOrThrow = async (planId: string) => {
  if (!planId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Plan id is required')
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      name: true,
      nameBn: true,
      type: true,
      isActive: true,
      isTrial: true,
      description: true,
      descriptionBn: true,
    },
  })

  if (!plan) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Subscription plan not found',
      CHECKOUT_ERROR_CODES.PLAN_NOT_FOUND
    )
  }

  if (!plan.isActive) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Subscription plan is inactive',
      CHECKOUT_ERROR_CODES.PLAN_INACTIVE
    )
  }

  return plan
}

const checkoutDraftSelect = {
  id: true,
  planId: true,
  billingCycle: true,
  couponCode: true,

  selectedDomain: true,
  selectedExtension: true,
  domainRegistrationYears: true,
  domainRegistrationPriceBdt: true,
  domainQuotedAt: true,
  domainQuoteExpiresAt: true,

  expiresAt: true,
  createdAt: true,
  updatedAt: true,

  plan: {
    select: {
      ...publicSubscriptionPlanSelect,
      isActive: true,
      isTrial: true,

      prices: {
        where: {
          isActive: true,
        },
        select: subscriptionPlanPricePublicSelect,
        orderBy: {
          durationDays: 'asc',
        },
      },
    },
  },
} satisfies Prisma.VendorCheckoutDraftSelect

const getCheckoutDraft = async (vendorId: string) => {
  const draft = await prisma.vendorCheckoutDraft.findUnique({
    where: {
      vendorId,
    },
    select: checkoutDraftSelect,
  })

  if (!draft) {
    return null
  }

  const now = new Date()

  const isExpired = draft.expiresAt <= now
  const isPlanUnavailable = !draft.plan.isActive || draft.plan.isTrial

  if (isExpired || isPlanUnavailable) {
    await prisma.vendorCheckoutDraft.delete({
      where: {
        id: draft.id,
      },
    })

    return null
  }

  let activeDraft = draft
  let domainNotice: string | null = null

  if (activeDraft.selectedDomain) {
    const managedDomainPurchaseEnabled = await isManagedDomainPurchaseEnabled()

    if (!managedDomainPurchaseEnabled) {
      activeDraft = await prisma.vendorCheckoutDraft.update({
        where: {
          id: activeDraft.id,
        },
        data: clearCheckoutDraftDomainData,
        select: checkoutDraftSelect,
      })
    }
  }

  const hasExpiredDomainQuote =
    Boolean(activeDraft.selectedDomain) &&
    (!activeDraft.domainQuoteExpiresAt || activeDraft.domainQuoteExpiresAt <= now)

  if (hasExpiredDomainQuote) {
    activeDraft = await prisma.vendorCheckoutDraft.update({
      where: {
        id: activeDraft.id,
      },
      data: {
        ...clearCheckoutDraftDomainData,
      },
      select: checkoutDraftSelect,
    })

    domainNotice = 'The saved domain quote has expired and has been removed.'
  }

  if (!activeDraft.couponCode) {
    return {
      ...activeDraft,
      coupon: null,
      couponNotice: null,
      domainNotice,
    }
  }

  try {
    const coupon = await CouponService.validateCoupon(vendorId, {
      code: activeDraft.couponCode,
      planId: activeDraft.planId,
      billingCycle: activeDraft.billingCycle,
    })

    return {
      ...activeDraft,
      coupon,
      couponNotice: null,
      domainNotice,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error
    }

    const updatedDraft = await prisma.vendorCheckoutDraft.update({
      where: {
        id: activeDraft.id,
      },
      data: {
        couponCode: null,
      },
      select: checkoutDraftSelect,
    })

    return {
      ...updatedDraft,
      coupon: null,
      couponNotice: 'The saved coupon is no longer valid and has been removed.',
      domainNotice,
    }
  }
}

const saveCheckoutDraft = async (vendorId: string, payload: SaveCheckoutDraft) => {
  const { planId, billingCycle } = payload

  vendorId = (await getVendorOrThrow(vendorId)).id

  const plan = await getPlanOrThrow(planId)

  if (plan.type === SubscriptionPlanType.FREE_TRIAL) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Free trial does not require checkout')
  }

  const selectedPlanPrice = await prisma.subscriptionPlanPrice.findUnique({
    where: {
      planId_billingCycle: {
        planId: plan.id,
        billingCycle,
      },
    },
    select: {
      id: true,
      isActive: true,
    },
  })

  if (!selectedPlanPrice || !selectedPlanPrice.isActive) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Selected billing option is not available')
  }

  const expiresAt = getCheckoutDraftExpiryTime()

  return prisma.vendorCheckoutDraft.upsert({
    where: {
      vendorId,
    },
    update: {
      planId: plan.id,
      billingCycle,
      couponCode: null,
      ...clearCheckoutDraftDomainData,
      expiresAt,
    },
    create: {
      vendorId,
      planId: plan.id,
      billingCycle,
      expiresAt,
    },
    select: checkoutDraftSelect,
  })
}

const saveCheckoutDraftDomain = async (vendorId: string, payload: SaveCheckoutDraftDomain) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  await assertManagedDomainPurchaseEnabledForCheckout(vendorId)

  const draft = await getCheckoutDraft(vendorId)

  if (!draft) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Checkout session has expired. Please select a plan again.'
    )
  }

  await ensureVendorCanPurchaseDomain(vendorId, draft.id)

  const domainQuote = await DomainQuoteService.getDomainQuoteSnapshot(payload.domain)

  return prisma.vendorCheckoutDraft.update({
    where: {
      vendorId,
    },
    data: {
      selectedDomain: domainQuote.domain,
      selectedExtension: domainQuote.extension,
      domainRegistrationYears: domainQuote.registrationYears,
      domainBaseRegistrationPriceUsd: domainQuote.baseRegistrationPriceUsd,

      domainIcannFeeUsd: domainQuote.icannFeeUsd,
      domainProviderPriceUsd: domainQuote.providerPriceUsd,
      domainExchangeRate: domainQuote.exchangeRate,
      domainMarkupPercent: domainQuote.markupPercent,
      domainRegistrationPriceBdt: domainQuote.registrationPriceBdt,
      domainQuotedAt: domainQuote.quotedAt,
      domainQuoteExpiresAt: domainQuote.quoteExpiresAt,

      expiresAt: getCheckoutDraftExpiryTime(),
    },
    select: checkoutDraftSelect,
  })
}

const removeCheckoutDraftDomain = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  const draft = await getCheckoutDraft(vendorId)

  if (!draft) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Checkout session has expired. Please select a plan again.'
    )
  }

  return prisma.vendorCheckoutDraft.update({
    where: {
      vendorId,
    },
    data: {
      ...clearCheckoutDraftDomainData,
      expiresAt: getCheckoutDraftExpiryTime(),
    },
    select: checkoutDraftSelect,
  })
}

const applyCheckoutDraftCoupon = async (vendorId: string, payload: ApplyCheckoutDraftCoupon) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  const draft = await getCheckoutDraft(vendorId)

  if (!draft) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Checkout session has expired. Please select a plan again.'
    )
  }

  const coupon = await CouponService.validateCoupon(vendorId, {
    code: payload.code,
    planId: draft.planId,
    billingCycle: draft.billingCycle,
  })

  const updatedDraft = await prisma.vendorCheckoutDraft.update({
    where: {
      vendorId,
    },
    data: {
      couponCode: coupon.code,
      expiresAt: getCheckoutDraftExpiryTime(),
    },
    select: checkoutDraftSelect,
  })

  return {
    draft: updatedDraft,
    coupon,
  }
}

const removeCheckoutDraftCoupon = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  const draft = await getCheckoutDraft(vendorId)

  if (!draft) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Checkout session has expired. Please select a plan again.'
    )
  }

  return prisma.vendorCheckoutDraft.update({
    where: {
      vendorId,
    },
    data: {
      couponCode: null,
      expiresAt: getCheckoutDraftExpiryTime(),
    },
    select: checkoutDraftSelect,
  })
}

const expireOldSubscriptions = async (vendorId: string) => {
  await prisma.vendorSubscription.updateMany({
    where: {
      vendorId,
      status: {
        in: [VendorSubscriptionStatus.TRIAL, VendorSubscriptionStatus.ACTIVE],
      },
      endDate: {
        lt: new Date(),
      },
    },
    data: {
      status: VendorSubscriptionStatus.EXPIRED,
    },
  })
}

const hasPaidInstallment = async (vendorId: string) => {
  const payment = await prisma.subscriptionPayment.findFirst({
    where: {
      vendorId,
      paymentStatus: PaymentStatus.PAID,
      isInstallmentIncluded: true,
    },
    select: {
      id: true,
    },
  })

  return Boolean(payment)
}

const createPlan = async (payload: CreateSubscriptionPlan) => {
  const existingPlan = await prisma.subscriptionPlan.findFirst({
    where: {
      OR: [{ name: payload.name }, { type: payload.type }],
    },
  })

  if (existingPlan) {
    throw new AppError(StatusCodes.CONFLICT, 'Plan name or plan type already exists')
  }

  validatePlanPrices(payload.prices)

  const isActive = payload.isActive ?? true

  if (payload.isMostPopular === true) {
    assertMostPopularEligibility(payload.type, isActive)
  }

  return prisma.$transaction(async (tx) => {
    if (payload.isMostPopular === true) {
      await tx.subscriptionPlan.updateMany({
        where: { isMostPopular: true },
        data: { isMostPopular: false },
      })
    }

    const isSpecialPlan =
      payload.type === SubscriptionPlanType.FREE_TRIAL ||
      payload.type === SubscriptionPlanType.INSTALLMENT
    const visitorLimit = isSpecialPlan ? null : (payload.visitorLimit ?? null)

    const newPlan = await tx.subscriptionPlan.create({
      data: {
        name: payload.name,
        nameBn: payload.nameBn ?? null,
        type: payload.type,
        isActive,
        isTrial: payload.isTrial ?? payload.type === SubscriptionPlanType.FREE_TRIAL,
        displayOrder: payload.displayOrder ?? 0,
        isMostPopular: payload.isMostPopular ?? false,
        visitorLimit,
        description: payload.description ?? null,
        descriptionBn: payload.descriptionBn ?? null,

        prices: {
          create: payload.prices.map((price) => ({
            billingCycle: price.billingCycle,
            price: price.price,
            discountPercent: price.discountPercent ?? 0,
            durationDays: price.durationDays,
            isActive: price.isActive ?? true,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        nameBn: true,
        type: true,
        isActive: true,
        isTrial: true,
        displayOrder: true,
        isMostPopular: true,
        visitorLimit: true,
        description: true,
        descriptionBn: true,
        createdAt: true,
        updatedAt: true,

        prices: {
          select: subscriptionPlanPriceSelect,
          orderBy: {
            durationDays: 'asc',
          },
        },
      },
    })
    await redis.del('chatbot:active_plans')
    return newPlan
  })
}

const getPlansForAdmin = async () => {
  const plans = await prisma.subscriptionPlan.findMany({
    select: {
      id: true,
      name: true,
      nameBn: true,
      type: true,
      isActive: true,
      isTrial: true,
      displayOrder: true,
      isMostPopular: true,
      visitorLimit: true,
      description: true,
      descriptionBn: true,
      createdAt: true,
      updatedAt: true,

      prices: {
        select: subscriptionPlanPriceSelect,
        orderBy: {
          durationDays: 'asc',
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })

  return plans
}

const getActivePlansForVendor = async () => {
  return prisma.subscriptionPlan.findMany({
    where: {
      isActive: true,
      NOT: {
        type: SubscriptionPlanType.INSTALLMENT,
      },
    },
    select: {
      ...publicSubscriptionPlanSelect,
      prices: {
        where: {
          isActive: true,
        },
        select: subscriptionPlanPricePublicSelect,
        orderBy: {
          durationDays: 'asc',
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })
}

const updatePlan = async (planId: string, payload: UpdateSubscriptionPlan) => {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      name: true,
      type: true,
      isActive: true,
      isMostPopular: true,
    },
  })

  if (!plan) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Subscription plan not found')
  }

  if (payload.name && payload.name !== plan.name) {
    const sameName = await prisma.subscriptionPlan.findUnique({
      where: { name: payload.name },
      select: { id: true },
    })

    if (sameName) {
      throw new AppError(StatusCodes.CONFLICT, 'Plan name already exists')
    }
  }

  const { prices, ...planData } = payload
  const effectiveIsActive = payload.isActive ?? plan.isActive
  const shouldClearMostPopular =
    payload.isMostPopular === false || (plan.isMostPopular && !effectiveIsActive)

  if (payload.isMostPopular === true) {
    assertMostPopularEligibility(plan.type, effectiveIsActive)
  }

  if (prices?.length) {
    validatePlanPrices(prices)
  }

  return prisma.$transaction(async (tx) => {
    if (payload.isMostPopular === true) {
      await tx.subscriptionPlan.updateMany({
        where: { isMostPopular: true },
        data: { isMostPopular: false },
      })
    }

    const isSpecialPlan =
      plan.type === SubscriptionPlanType.FREE_TRIAL ||
      plan.type === SubscriptionPlanType.INSTALLMENT
    const sanitizedPlanData = { ...planData }
    if (isSpecialPlan) {
      sanitizedPlanData.visitorLimit = null
    }

    await tx.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...Object.fromEntries(Object.entries(sanitizedPlanData).filter(([, value]) => value !== undefined)),
        ...(shouldClearMostPopular && { isMostPopular: false }),
      },
    })

    if (sanitizedPlanData.visitorLimit !== undefined) {
      const affectedSubscriptions = await tx.vendorSubscription.findMany({
        where: {
          planId,
          status: { in: ['ACTIVE', 'TRIAL', 'EXPIRED'] },
        },
        select: { vendor: { select: { subDomain: true, customDomain: { select: { domain: true } } } } },
      })

      await tx.vendorSubscription.updateMany({
        where: {
          planId,
          status: { in: ['ACTIVE', 'TRIAL', 'EXPIRED'] },
        },
        data: {
          visitorLimit: sanitizedPlanData.visitorLimit,
        },
      })

      for (const sub of affectedSubscriptions) {
        if (sub.vendor.subDomain) {
          await redis.del(`vendor_profile:${sub.vendor.subDomain.toLowerCase()}`)
        }
        if (sub.vendor.customDomain?.domain) {
          await redis.del(`vendor_profile:${sub.vendor.customDomain.domain.toLowerCase()}`)
        }
      }
    }

    if (prices?.length) {
      for (const price of prices) {
        await tx.subscriptionPlanPrice.upsert({
          where: {
            planId_billingCycle: {
              planId,
              billingCycle: price.billingCycle,
            },
          },
          update: {
            price: price.price,
            discountPercent: price.discountPercent ?? 0,
            durationDays: price.durationDays,
            isActive: price.isActive ?? true,
          },
          create: {
            planId,
            billingCycle: price.billingCycle,
            price: price.price,
            discountPercent: price.discountPercent ?? 0,
            durationDays: price.durationDays,
            isActive: price.isActive ?? true,
          },
        })
      }
    }

    const updatedPlan = await tx.subscriptionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        isTrial: true,
        displayOrder: true,
        isMostPopular: true,
        visitorLimit: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        prices: {
          select: subscriptionPlanPriceSelect,
          orderBy: {
            durationDays: 'asc',
          },
        },
      },
    })
    await redis.del('chatbot:active_plans')
    return updatedPlan
  })
}

const deletePlan = async (planId: string) => {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  })

  if (!plan) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Subscription plan not found')
  }

  const usedPlan = await prisma.vendorSubscription.findFirst({
    where: {
      planId,
      status: {
        in: [
          VendorSubscriptionStatus.TRIAL,
          VendorSubscriptionStatus.ACTIVE,
          VendorSubscriptionStatus.PENDING_PAYMENT,
        ],
      },
    },
    select: {
      id: true,
    },
  })

  if (usedPlan) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'This plan is already used. Please deactivate it instead of deleting it.'
    )
  }

  const deletedPlan = await prisma.subscriptionPlan.delete({
    where: { id: planId },
  })
  await redis.del('chatbot:active_plans')
  return deletedPlan
}

export const assignPlanToVendor = async (vendorId: string, planId: string, customDays?: number) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      name: true,
      type: true,
      visitorLimit: true,
      prices: {
        where: { isActive: true },
        take: 1,
      },
    },
  })

  if (!plan) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Subscription plan not found')
  }

  const defaultPrice = plan.prices[0]
  if (!defaultPrice) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'No active price configuration found for this plan')
  }

  const now = new Date()
  const durationDays = customDays || defaultPrice.durationDays
  const endDate = addDays(now, durationDays)

  return prisma.$transaction(async (tx) => {
    await tx.vendorSubscription.updateMany({
      where: {
        vendorId,
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
      },
    })

    const isTrial = plan.type === SubscriptionPlanType.FREE_TRIAL
    const status = isTrial ? VendorSubscriptionStatus.TRIAL : VendorSubscriptionStatus.ACTIVE

    const isSpecialPlan =
      plan.type === SubscriptionPlanType.FREE_TRIAL ||
      plan.type === SubscriptionPlanType.INSTALLMENT
    const visitorLimit = isSpecialPlan ? null : (plan.visitorLimit ?? null)

    const newSubscription = await tx.vendorSubscription.create({
      data: {
        vendorId,
        planId: plan.id,
        billingCycle: defaultPrice.billingCycle,
        status,
        startDate: now,
        endDate,
        paidAt: now,
        amountPaid: 0,
        visitorLimit,
        assignedByAdmin: true,
        customDays: customDays || null,
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
        assignedByAdmin: true,
        customDays: true,
        createdAt: true,
        updatedAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
            isTrial: true,
          },
        },
      },
    })

    await VendorService.invalidateVendorProfileCache(vendorId)
    return newSubscription
  })
}

export const createTrialForVendor = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  const now = new Date()

  const freeTrialPlan = await prisma.subscriptionPlan.findFirst({
    where: {
      type: SubscriptionPlanType.FREE_TRIAL,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      prices: {
        where: {
          billingCycle: SubscriptionBillingCycle.MONTHLY,
          isActive: true,
        },
        select: subscriptionPlanPricePublicSelect,
        take: 1,
      },
    },
  })

  if (!freeTrialPlan) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Active free trial plan configuration not found')
  }

  const trialPrice = freeTrialPlan.prices[0]

  if (!trialPrice) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Free trial price configuration not found')
  }

  const endDate = addDays(now, trialPrice.durationDays)

  return prisma.$transaction(async (tx) => {
    const previousTrial = await tx.vendorSubscription.findFirst({
      where: {
        vendorId,
        plan: {
          type: SubscriptionPlanType.FREE_TRIAL,
        },
      },
      select: {
        id: true,
      },
    })

    if (previousTrial) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Free trial has already been used')
    }

    await tx.vendorSubscription.updateMany({
      where: {
        vendorId,
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
      },
    })

    const trialSubscription = await tx.vendorSubscription.create({
      data: {
        vendorId,
        planId: freeTrialPlan.id,
        billingCycle: SubscriptionBillingCycle.MONTHLY,
        status: VendorSubscriptionStatus.TRIAL,
        startDate: now,
        endDate,
        paidAt: now,
        amountPaid: 0,
        visitorLimit: null,
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
            isTrial: true,
          },
        },
      },
    })

    await VendorService.invalidateVendorProfileCache(vendorId)
    return trialSubscription
  })
}

const getTrialStatus = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id

  const trial = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      plan: {
        type: SubscriptionPlanType.FREE_TRIAL,
      },
    },
    select: {
      id: true,
    },
  })

  return {
    hasUsedFreeTrial: Boolean(trial),
  }
}

// Payment session helper
const initiateSubscriptionPaymentSession = async (
  vendor: Awaited<ReturnType<typeof getVendorOrThrow>>,
  paymentMethod: OnlinePaymentProvider,
  transactionId: string,
  amount: Prisma.Decimal | number
) => {
  const paymentProvider = getPaymentProvider(paymentMethod)

  const customerCity = vendor.address.district.name
  const customerState = vendor.address.division.name
  const customerAddress = `${vendor.address.area}, ${customerCity}, ${customerState}`

  return paymentProvider.initiate({
    transactionId,
    amount: Number(amount),
    customer: {
      name: vendor.user.name ?? vendor.shopName,
      phone: vendor.user.phone,
      email: vendor.user.email,
      city: customerCity,
      state: customerState,
      address: customerAddress,
    },
  })
}

const cancelVendorSubscription = async (vendorId: string, payload: CancelSubscription = {}) => {
  vendorId = (await getVendorOrThrow(vendorId)).id
  await expireOldSubscriptions(vendorId)

  const subscription = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      status: {
        in: [VendorSubscriptionStatus.ACTIVE, VendorSubscriptionStatus.TRIAL],
      },
      endDate: {
        gt: new Date(),
      },
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
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      cancellationReason: true,
      createdAt: true,
      updatedAt: true,

      plan: {
        select: publicSubscriptionPlanSelect,
      },
    },
    orderBy: {
      endDate: 'desc',
    },
  })

  if (!subscription) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'No active subscription found to cancel')
  }

  if (subscription.cancelAtPeriodEnd) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Subscription is already scheduled for cancellation'
    )
  }

  const cancelledSubscription = await prisma.vendorSubscription.update({
    where: {
      id: subscription.id,
    },
    data: {
      cancelAtPeriodEnd: true,
      cancelledAt: new Date(),
      cancellationReason: payload.reason ?? null,
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
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      cancellationReason: true,
      createdAt: true,
      updatedAt: true,

      plan: {
        select: publicSubscriptionPlanSelect,
      },
    },
  })

  await VendorService.invalidateVendorProfileCache(vendorId)
  return cancelledSubscription
}

const checkoutPlan = async (vendorId: string, payload: CheckoutSubscription) => {
  if (payload.includeDomain) {
    await assertManagedDomainPurchaseEnabledForCheckout(vendorId)
  }

  const reviewedDraft = await getCheckoutDraft(vendorId)

  if (!reviewedDraft) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Checkout session has expired. Please select a plan again.',
      CHECKOUT_ERROR_CODES.CHECKOUT_DRAFT_EXPIRED
    )
  }

  if (reviewedDraft.couponNotice) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Your coupon is no longer valid. Please review the updated total before paying.',
      CHECKOUT_ERROR_CODES.CHECKOUT_COUPON_INVALID
    )
  }

  if (payload.includeDomain && reviewedDraft.domainNotice) {
    throw new AppError(
      StatusCodes.CONFLICT,
      'Your saved domain quote has expired. Please select the domain again.',
      CHECKOUT_ERROR_CODES.DOMAIN_QUOTE_EXPIRED
    )
  }

  const confirmedDomainRegistrant = payload.includeDomain
    ? await DomainRegistrantService.getConfirmedVendorDomainRegistrantOrThrow(vendorId)
    : null

  const draft = await prisma.vendorCheckoutDraft.findUnique({
    where: {
      vendorId,
    },
    select: checkoutDraftPaymentSelect,
  })

  if (!draft) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Checkout session has expired. Please select a plan again.',
      CHECKOUT_ERROR_CODES.CHECKOUT_DRAFT_EXPIRED
    )
  }

  const { planId, billingCycle, couponCode } = draft

  const verifiedDomainQuote = payload.includeDomain
    ? await revalidateCheckoutDomainQuote(vendorId, draft)
    : null

  const vendor = await getVendorOrThrow(vendorId)
  vendorId = vendor.id
  await expireOldSubscriptions(vendorId)

  const paymentMethod = payload.paymentMethod

  await PaymentProviderAvailabilityService.assertPaymentProviderAvailable(paymentMethod)

  const plan = await getPlanOrThrow(planId)

  if (plan.type === SubscriptionPlanType.FREE_TRIAL) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Free trial does not require checkout')
  }

  const paidInstallment = await hasPaidInstallment(vendorId)

  const selectedPlanPrice = await prisma.subscriptionPlanPrice.findUnique({
    where: {
      planId_billingCycle: {
        planId: plan.id,
        billingCycle: billingCycle,
      },
    },
    select: {
      price: true,
      isActive: true,
    },
  })

  if (!selectedPlanPrice || !selectedPlanPrice.isActive) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Selected billing option is not available',
      CHECKOUT_ERROR_CODES.BILLING_OPTION_UNAVAILABLE
    )
  }

  const coupon = couponCode
    ? await CouponService.validateCoupon(vendorId, {
        code: couponCode,
        planId: plan.id,
        billingCycle,
      })
    : null

  // Prevent checkout for the current active plan and billing cycle
  const currentActiveSubscription = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      status: {
        in: [VendorSubscriptionStatus.TRIAL, VendorSubscriptionStatus.ACTIVE],
      },
      endDate: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      planId: true,
      billingCycle: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (
    currentActiveSubscription?.planId === plan.id &&
    currentActiveSubscription.billingCycle === billingCycle
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You are already subscribed to this plan',
      CHECKOUT_ERROR_CODES.ALREADY_SUBSCRIBED
    )
  }

  const installmentPlan = await prisma.subscriptionPlan.findFirst({
    where: {
      type: SubscriptionPlanType.INSTALLMENT,
      isActive: true,
    },
  })

  const installmentPlanPrice = installmentPlan
    ? await prisma.subscriptionPlanPrice.findFirst({
        where: {
          planId: installmentPlan.id,
          billingCycle: SubscriptionBillingCycle.MONTHLY,
          isActive: true,
        },
        select: {
          price: true,
        },
      })
    : null

  const planAmount = Number(selectedPlanPrice.price)

  const discountAmount = coupon?.discountAmount ?? 0

  const installmentFee =
    !paidInstallment && installmentPlanPrice ? Number(installmentPlanPrice.price) : 0

  const domainAmount = verifiedDomainQuote?.registrationPriceBdt ?? 0

  const subscriptionAmount = planAmount - discountAmount + installmentFee

  const originalAmount = planAmount + installmentFee + domainAmount

  const totalAmount = subscriptionAmount + domainAmount

  const isInstallmentIncluded = installmentFee > 0

  // Affiliate commission is calculated only on the subscription-side amount,
  // excluding domainAmount which is a pass-through cost.
  let affiliateEarning = 0
  if (coupon?.affiliateCommissionValue) {
    if (coupon.affiliateCommissionType === 'PERCENTAGE') {
      affiliateEarning = (subscriptionAmount * coupon.affiliateCommissionValue) / 100
    } else {
      affiliateEarning = coupon.affiliateCommissionValue
    }
  }

  const paymentDomainData = buildSubscriptionPaymentDomainData(verifiedDomainQuote)

  await cancelExpiredPendingCheckouts(vendorId)

  const existingPending = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      planId: plan.id,
      billingCycle: billingCycle,
      status: VendorSubscriptionStatus.PENDING_PAYMENT,
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
      createdAt: true,
      updatedAt: true,

      plan: {
        select: publicSubscriptionPlanSelect,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // existing payment
  if (existingPending) {
    const existingPayment = await prisma.subscriptionPayment.findFirst({
      where: {
        vendorId,
        subscriptionId: existingPending.id,
        paymentStatus: PaymentStatus.PENDING,
      },
      select: pendingCheckoutPaymentSelect,
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (existingPayment?.transactionId) {
      const hasSameRegistrantSnapshot =
        !payload.includeDomain ||
        (confirmedDomainRegistrant !== null &&
          DomainRegistrantService.isDomainRegistrantSnapshotCurrent(
            existingPayment.domainRegistrantSnapshot,
            confirmedDomainRegistrant
          ))

      const isSamePendingPayment =
        existingPayment.paymentMethod === paymentMethod &&
        Number(existingPayment.amount) === totalAmount &&
        Number(existingPayment.originalAmount) === originalAmount &&
        Number(existingPayment.discountAmount) === discountAmount &&
        Number(existingPayment.finalAmount) === totalAmount &&
        existingPayment.couponId === (coupon?.couponId ?? null) &&
        existingPayment.isInstallmentIncluded === isInstallmentIncluded &&
        isSameSubscriptionPaymentDomain(existingPayment, verifiedDomainQuote) &&
        hasSameRegistrantSnapshot

      if (isSamePendingPayment) {
        const refreshedPayment = await prisma.subscriptionPayment.update({
          where: {
            id: existingPayment.id,
          },
          data: {
            amount: totalAmount,
            originalAmount,
            discountAmount,
            finalAmount: totalAmount,
            couponId: coupon?.couponId ?? null,

            isInstallmentIncluded,
            note: isInstallmentIncluded ? 'INSTALLMENT_FEE_INCLUDED' : null,

            affiliateEarning,

            ...paymentDomainData,
          },
          select: pendingCheckoutPaymentSelect,
        })

        await cancelOtherPendingCheckouts(vendorId, existingPending.id)

        const paymentResult = await initiateSubscriptionPaymentSession(
          vendor,
          paymentMethod,
          existingPayment.transactionId,
          refreshedPayment.amount
        )

        if (paymentResult.gatewayData) {
          if (paymentMethod === PaymentMethod.EPS) {
            await appendEpsGatewayAttempt(refreshedPayment.id, paymentResult.gatewayData)
          } else {
            await prisma.subscriptionPayment.update({
              where: {
                id: refreshedPayment.id,
              },
              data: {
                gatewayData: paymentResult.gatewayData,
              },
            })
          }
        }

        return {
          subscription: existingPending,
          paymentId: refreshedPayment.id,
          transactionId: existingPayment.transactionId,
          gatewayPageURL: paymentResult.gatewayPageURL,
          breakdown: {
            planAmount,
            discountAmount,
            installmentFee,
            subscriptionAmount,
            domainAmount,
            totalAmount: Number(refreshedPayment.amount),
            isInstallmentIncluded,
            isDomainIncluded: refreshedPayment.isDomainIncluded,
          },
        }
      }

      await cancelPendingCheckout(existingPending.id, 'CANCELLED_PENDING_PAYMENT_CHANGED')
    } else {
      await cancelPendingCheckout(existingPending.id, 'CANCELLED_BROKEN_PENDING_PAYMENT')
    }
  }

  await cancelAllPendingCheckouts(vendorId, 'CANCELLED_BY_NEW_CHECKOUT')

  const transactionId = `SUB-TXN-${Date.now()}`

  const result = await prisma.$transaction(async (tx) => {
    const domainRegistrantSnapshot = payload.includeDomain
      ? await DomainRegistrantService.createDomainRegistrantSnapshotForPayment(tx, vendorId)
      : null

    const subscription = await tx.vendorSubscription.create({
      data: {
        vendorId,
        planId: plan.id,
        billingCycle: billingCycle,
        status: VendorSubscriptionStatus.PENDING_PAYMENT,
        amountPaid: 0,
        visitorLimit: null,
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
        createdAt: true,
        updatedAt: true,

        plan: {
          select: publicSubscriptionPlanSelect,
        },
      },
    })

    const payment = await tx.subscriptionPayment.create({
      data: {
        vendorId,
        subscriptionId: subscription.id,
        billingCycle,

        amount: totalAmount,
        originalAmount,
        discountAmount,
        finalAmount: totalAmount,
        couponId: coupon?.couponId ?? null,

        isInstallmentIncluded,
        note: isInstallmentIncluded ? 'INSTALLMENT_FEE_INCLUDED' : null,

        affiliateEarning,

        ...paymentDomainData,

        domainRegistrantSnapshot:
          domainRegistrantSnapshot === null
            ? Prisma.DbNull
            : (domainRegistrantSnapshot as Prisma.InputJsonValue),

        paymentMethod: paymentMethod,
        transactionId,
        purpose: SubscriptionPaymentPurpose.SUBSCRIPTION_PLAN,
      },
    })

    return {
      subscription,
      payment,
    }
  })

  const paymentResult = await initiateSubscriptionPaymentSession(
    vendor,
    paymentMethod,
    transactionId,
    result.payment.amount
  )

  if (paymentResult.gatewayData) {
    await prisma.subscriptionPayment.update({
      where: {
        id: result.payment.id,
      },
      data: {
        gatewayData: paymentResult.gatewayData,
      },
    })
  }

  return {
    subscription: result.subscription,
    paymentId: result.payment.id,
    transactionId,
    gatewayPageURL: paymentResult.gatewayPageURL,
    breakdown: {
      planAmount,
      discountAmount,
      installmentFee,
      subscriptionAmount,
      domainAmount,
      totalAmount,
      isInstallmentIncluded,
      isDomainIncluded: paymentDomainData.isDomainIncluded,
    },
  }
}

const downloadSubscriptionReceipt = async (vendorId: string, paymentId: string) => {
  const payment = await prisma.subscriptionPayment.findFirst({
    where: {
      id: paymentId,
      vendorId,
    },
    include: {
      vendor: {
        select: {
          shopName: true,
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },

      subscription: {
        include: {
          plan: {
            select: {
              name: true,
            },
          },
        },
      },

      coupon: {
        select: {
          code: true,
        },
      },
    },
  })

  if (!payment) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Payment not found')
  }

  if (payment.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Receipt is available only for paid payments')
  }

  if (!payment.subscription) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Subscription data not found for this payment')
  }

  if (!payment.paidAt) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Paid date not found for this payment')
  }

  const planPrice = await prisma.subscriptionPlanPrice.findUnique({
    where: {
      planId_billingCycle: {
        planId: payment.subscription.planId,
        billingCycle: payment.billingCycle,
      },
    },
    select: {
      price: true,
    },
  })

  const planAmount = planPrice ? Number(planPrice.price) : Number(payment.amount)

  const discountAmount = Number(payment.discountAmount ?? 0)

  const shouldIncludeDomainInReceipt =
    payment.paymentStatus === PaymentStatus.PAID &&
    payment.isDomainIncluded &&
    Boolean(payment.domain?.trim()) &&
    payment.domainRegistrationYears !== null &&
    payment.domainRegistrationYears > 0 &&
    payment.domainRegistrationPriceBdt !== null

  if (payment.isDomainIncluded && payment.domainRegistrationPriceBdt === null) {
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, 'Domain payment amount is missing')
  }

  const domainAmount = shouldIncludeDomainInReceipt ? Number(payment.domainRegistrationPriceBdt) : 0

  const setupFee = payment.isInstallmentIncluded
    ? Math.max(Number(payment.amount) + discountAmount - planAmount - domainAmount, 0)
    : 0

  const pdf = await generateSubscriptionReceiptPdf({
    receiptNo: `RCPT-${payment.id.slice(0, 8).toUpperCase()}`,
    transactionId: payment.transactionId ?? payment.id,
    vendorName: payment.vendor.shopName || payment.vendor.user.name,
    vendorEmail: payment.vendor.user.email,

    planName: payment.subscription.plan.name,
    planAmount,
    setupFee,
    isInstallmentIncluded: payment.isInstallmentIncluded,

    isDomainIncluded: shouldIncludeDomainInReceipt,
    domain: payment.domain,
    domainExtension: payment.domainExtension,
    domainRegistrationYears: payment.domainRegistrationYears,
    domainAmount,

    billingCycle: payment.billingCycle,
    couponCode: payment.coupon?.code ?? null,
    discountAmount,
    amount: Number(payment.amount),
    paymentMethod: payment.paymentMethod,
    status: payment.paymentStatus,
    paidAt: payment.paidAt,
  })

  return pdf
}

const getVendorSubscription = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id
  await expireOldSubscriptions(vendorId)

  const subscription = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      status: {
        in: [VendorSubscriptionStatus.TRIAL, VendorSubscriptionStatus.ACTIVE],
      },
      endDate: {
        not: null,
        gte: new Date(),
      },
    },
    orderBy: {
      createdAt: 'desc',
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
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      cancellationReason: true,
      createdAt: true,
      updatedAt: true,

      plan: {
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          prices: {
            where: {
              isActive: true,
            },
            select: subscriptionPlanPricePublicSelect,
            orderBy: {
              durationDays: 'asc',
            },
          },
        },
      },

      payments: {
        select: subscriptionPaymentSelect,
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  })

  if (!subscription) {
    return null
  }

  const subscriptionAccess = getVendorSubscriptionAccess(subscription)

  const remainingMs = subscription.endDate
    ? Math.max(subscription.endDate.getTime() - Date.now(), 0)
    : 0

  const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24))

  return {
    ...subscription,
    remainingMs,
    remainingDays,
    subscriptionAccess,
  }
}

const ensureVendorHasActiveSubscription = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id
  await expireOldSubscriptions(vendorId)

  const subscription = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId,
      status: {
        in: [VendorSubscriptionStatus.TRIAL, VendorSubscriptionStatus.ACTIVE],
      },
      endDate: {
        gte: new Date(),
      },
    },
    select: {
      id: true,
      vendorId: true,
      planId: true,
      billingCycle: true,
      status: true,
      startDate: true,
      endDate: true,

      plan: {
        select: publicSubscriptionPlanSelect,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (!subscription) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Active subscription required')
  }

  return subscription
}

const getVendorSubscriptionForAdmin = async (vendorId: string) => {
  vendorId = (await getVendorOrThrow(vendorId)).id
  await expireOldSubscriptions(vendorId)

  const subscriptions = await prisma.vendorSubscription.findMany({
    where: {
      vendorId,
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
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      cancellationReason: true,
      createdAt: true,
      updatedAt: true,

      plan: {
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
        },
      },

      payments: {
        select: subscriptionPaymentSelect,
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return subscriptions
}

export type DomainPurchaseResult = {
  domain: string
  extension: string | null
  registrationYears: number
  price: number
  status: PurchasedDomainStatus
}

export type SubscriptionPaymentResultResponse = {
  paymentId: string
  paymentStatus: PaymentStatus
  planName: string
  billingCycle: SubscriptionBillingCycle
  amount: number
  paymentMethod: PaymentMethod
  transactionId: string
  paidAt: Date | null
  createdAt: Date
  domainPurchase: DomainPurchaseResult | null
}

const getSubscriptionPaymentResult = async (
  resultToken: string
): Promise<SubscriptionPaymentResultResponse> => {
  const paymentResultTokenContext = await getPaymentResultTokenContext(resultToken)

  if (paymentResultTokenContext.transactionType !== PaymentResultType.SUBSCRIPTION) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid subscription payment result token')
  }

  const payment = await prisma.subscriptionPayment.findUnique({
    where: {
      transactionId: paymentResultTokenContext.transactionId,
    },
    select: {
      id: true,
      paymentStatus: true,
      amount: true,
      billingCycle: true,
      paymentMethod: true,
      transactionId: true,
      paidAt: true,
      createdAt: true,

      isDomainIncluded: true,
      domain: true,
      domainExtension: true,
      domainRegistrationYears: true,
      domainRegistrationPriceBdt: true,

      purchasedDomain: {
        select: {
          status: true,
        },
      },

      subscription: {
        select: {
          plan: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })

  if (!payment) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid subscription payment result token')
  }

  const isPaid = payment.paymentStatus === PaymentStatus.PAID
  const hasDomainData =
    payment.isDomainIncluded &&
    Boolean(payment.domain?.trim()) &&
    payment.domainRegistrationPriceBdt !== null &&
    payment.domainRegistrationYears !== null &&
    payment.domainRegistrationYears > 0

  let domainPurchase: DomainPurchaseResult | null = null

  if (
    isPaid &&
    hasDomainData &&
    payment.domain &&
    payment.domainRegistrationPriceBdt !== null &&
    payment.domainRegistrationYears !== null
  ) {
    let domainStatus: PurchasedDomainStatus = PurchasedDomainStatus.REGISTRATION_PENDING

    if (payment.purchasedDomain?.status) {
      const rawStatus = payment.purchasedDomain.status
      if (
        rawStatus === PurchasedDomainStatus.REGISTRATION_PENDING ||
        rawStatus === PurchasedDomainStatus.REGISTERING ||
        rawStatus === PurchasedDomainStatus.REGISTERED ||
        rawStatus === PurchasedDomainStatus.DNS_CONFIGURING ||
        rawStatus === PurchasedDomainStatus.READY_TO_ACTIVATE ||
        rawStatus === PurchasedDomainStatus.ACTIVE ||
        rawStatus === PurchasedDomainStatus.REGISTRATION_FAILED ||
        rawStatus === PurchasedDomainStatus.DNS_FAILED
      ) {
        domainStatus = rawStatus
      }
    }

    domainPurchase = {
      domain: payment.domain,
      extension: payment.domainExtension ?? null,
      registrationYears: payment.domainRegistrationYears,
      price: payment.domainRegistrationPriceBdt,
      status: domainStatus,
    }
  }

  return {
    paymentId: payment.id,
    paymentStatus: payment.paymentStatus,
    planName: payment.subscription?.plan.name ?? 'Unknown plan',
    billingCycle: payment.billingCycle,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    transactionId: payment.transactionId ?? paymentResultTokenContext.transactionId,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    domainPurchase,
  }
}

// Get Billing History
const getBillingHistory = async (
  vendorId: string,
  query: {
    page?: string | number
    limit?: string | number
  } = {}
) => {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50)
  const skip = (page - 1) * limit

  const where = {
    vendorId,
  }

  const [total, totalPaidResult, payments] = await Promise.all([
    prisma.subscriptionPayment.count({ where }),

    prisma.subscriptionPayment.aggregate({
      where: {
        ...where,
        paymentStatus: 'PAID',
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.subscriptionPayment.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        amount: true,
        billingCycle: true,
        paymentStatus: true,
        transactionId: true,
        isInstallmentIncluded: true,
        paidAt: true,
        createdAt: true,
        subscription: {
          select: {
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
  ])

  const data = payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    billingCycle: payment.billingCycle,
    paymentStatus: payment.paymentStatus,
    transactionId: payment.transactionId ?? null,
    paidAt: payment.paidAt ?? payment.createdAt,
    planName: payment.subscription?.plan.name ?? 'Unknown plan',
    isInstallmentIncluded: payment.isInstallmentIncluded,
  }))

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    summary: {
      totalPaid: totalPaidResult._sum.amount ?? 0,
    },
    data,
  }
}

export const SubscriptionService = {
  createPlan,
  getPlansForAdmin,
  getActivePlansForVendor,
  updatePlan,
  deletePlan,
  createTrialForVendor,
  assignPlanToVendor,
  getCheckoutDraft,
  saveCheckoutDraft,
  saveCheckoutDraftDomain,
  removeCheckoutDraftDomain,
  cancelVendorSubscription,
  checkoutPlan,
  downloadSubscriptionReceipt,
  getVendorSubscription,
  getTrialStatus,
  applyCheckoutDraftCoupon,
  removeCheckoutDraftCoupon,
  ensureVendorHasActiveSubscription,
  getVendorSubscriptionForAdmin,
  getSubscriptionPaymentResult,
  getBillingHistory,
}

/**
 * 1. when vendor will register auto free trial will be activated
 */
