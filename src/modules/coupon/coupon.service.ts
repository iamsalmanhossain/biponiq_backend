import redis from '../../config/redis.config.js'
import crypto from 'crypto'
import httpStatus from 'http-status'
import { prisma } from '../../lib/prisma.js'
import { TCreateCoupon, TUpdateCoupon, TValidateCoupon } from './coupon.validation.js'
import AppError from '../../shared/errors/AppError.js'
import { calculateDiscountAmount, normalizeCouponCode } from './coupon.helper.js'
import { Prisma, CouponDiscountType } from '@prisma/client'
import bcrypt from 'bcrypt'
import { sendCouponAndSetupEmail } from '../../shared/utils/email.service.js'
import { env } from '../../config/env.js'
import { PlatformSettingService } from '../platformSetting/platformSetting.service.js'


const invalidateCouponCache = async (code: string) => {
  
  await redis.del(`coupon:${code}`)
}

type GetAllCouponsQuery = {
  page?: number
  limit?: number
  search?: string
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
}

// Create Coupon
const createCoupon = async (payload: TCreateCoupon) => {
  const { applicablePlanIds, affiliateEmail, affiliateName, affiliateCommissionType, affiliateCommissionValue, ...couponData } = payload
  const code = normalizeCouponCode(couponData.code)

  const existingCoupon = await prisma.coupon.findUnique({
    where: { code },
    select: { id: true },
  })

  if (existingCoupon) {
    throw new AppError(httpStatus.CONFLICT, 'Coupon code already exists')
  }

  const activePlans = await prisma.subscriptionPlan.findMany({
    where: {
      id: { in: applicablePlanIds },
      isActive: true,
    },
    select: { id: true },
  })

  if (activePlans.length !== applicablePlanIds.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'One or more subscription plans are invalid')
  }

  let affiliateId = null;
  let isNewAffiliate = false;
  if (affiliateEmail) {
    let affiliate = await prisma.affiliate.findUnique({ where: { email: affiliateEmail } });
    if (!affiliate) {
      if (!affiliateName) {
         throw new AppError(httpStatus.BAD_REQUEST, 'Affiliate name is required when creating a new affiliate')
      }
      const rawPassword = '12345678'
      const hashedPassword = await bcrypt.hash(rawPassword, 10)
      affiliate = await prisma.affiliate.create({
        data: {
          name: affiliateName,
          email: affiliateEmail,
          password: hashedPassword,
        },
      })
      isNewAffiliate = true;
    } else if (affiliate.vendorId !== null) {
      throw new AppError(httpStatus.FORBIDDEN, 'This email belongs to a vendor affiliate. Please use a different email.')
    }
    affiliateId = affiliate.id;
  }

  const couponCreateData: any = {
    code,
    discountType: couponData.discountType,
    discountValue: couponData.discountValue,
    startsAt: new Date(couponData.startsAt),
    expiresAt: new Date(couponData.expiresAt),

    ...(couponData.maxDiscountAmount !== undefined && {
      maxDiscountAmount: couponData.maxDiscountAmount,
    }),

    ...(couponData.minimumAmount !== undefined && {
      minimumAmount: couponData.minimumAmount,
    }),

    ...(couponData.usageLimit !== undefined && {
      usageLimit: couponData.usageLimit,
    }),

    ...(couponData.perUserLimit !== undefined && {
      perUserLimit: couponData.perUserLimit,
    }),

    ...(couponData.isActive !== undefined && {
      isActive: couponData.isActive,
    }),

    ...(affiliateId !== null && {
      affiliateId,
      affiliateCommissionType: affiliateCommissionType as CouponDiscountType ?? "PERCENTAGE",
      affiliateCommissionValue: affiliateCommissionValue ?? 0,
    }),

    applicablePlans: {
      create: applicablePlanIds.map((planId) => ({
        planId,
      })),
    },
  }

  const coupon = await prisma.coupon.create({
    data: couponCreateData,
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
      createdAt: true,
      applicablePlans: {
        select: {
          plan: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
      affiliate: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      affiliateCommissionType: true,
      affiliateCommissionValue: true,
    },
  })

  // Send email if a new affiliate was created
  if (isNewAffiliate && affiliateEmail && affiliateName && coupon.affiliate?.id) {
    const baseUrl = env.CLIENT_URL || 'http://localhost:3000'
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    
    // Generate a long-lived OTP for initial setup (valid for 7 days)
    const resetCode = crypto.randomInt(100000, 999999).toString()
    await redis.set(`otp:affiliate:${coupon.affiliate.id}:PASSWORD_RESET`, resetCode, 'EX', 7 * 24 * 60 * 60)

    const protocol = env.FRONTEND_STORE_PROTOCOL || 'https'
    const rootDomain = env.FRONTEND_STORE_ROOT_DOMAIN || (env.PLATFORM_DOMAIN ? env.PLATFORM_DOMAIN.replace(/^www\./, '') : 'biponiq.com')
    const setupUrl = env.NODE_ENV === 'production'
      ? `${protocol}://affiliate.${rootDomain}/auth/set-password?email=${encodeURIComponent(affiliateEmail)}&code=${resetCode}`
      : `${cleanBaseUrl}/auth/affiliate/set-password?email=${encodeURIComponent(affiliateEmail)}&code=${resetCode}`
    
    
    sendCouponAndSetupEmail(affiliateEmail, affiliateName, code, setupUrl).catch((err) => {
      console.error('Failed to send coupon creation email:', err)
    })
  }

  return coupon
}

// Get Coupon
const getAllCoupons = async (query: GetAllCouponsQuery) => {
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const skip = (page - 1) * limit

  const now = new Date()

  const where: Prisma.CouponWhereInput = {
    isDeleted: false,
  }

  if (query.search) {
    where.code = {
      contains: query.search.trim(),
      mode: 'insensitive',
    }
  }

  if (query.status === 'ACTIVE') {
    where.isActive = true
    where.startsAt = { lte: now }
    where.expiresAt = { gte: now }
  }

  if (query.status === 'INACTIVE') {
    where.isActive = false
  }

  if (query.status === 'EXPIRED') {
    where.expiresAt = { lt: now }
  }

  const [coupons, total, activeCoupons, totalRedemptions, discountGiven] =
    await prisma.$transaction([
      prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
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
          createdAt: true,
          applicablePlans: {
            select: {
              plan: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
          affiliate: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          affiliateCommissionType: true,
          affiliateCommissionValue: true,
        },
      }),

      prisma.coupon.count({
        where,
      }),

      prisma.coupon.count({
        where: {
          isDeleted: false,
          isActive: true,
          startsAt: {
            lte: now,
          },
          expiresAt: {
            gte: now,
          },
        },
      }),

      prisma.couponUsage.count({
        where: {
          coupon: {
            isDeleted: false,
          },
        },
      }),

      prisma.couponUsage.aggregate({
        where: {
          coupon: {
            isDeleted: false,
          },
        },
        _sum: {
          discountAmount: true,
        },
      }),
    ])

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    summary: {
      totalCoupons: total,
      activeCoupons,
      totalRedemptions,
      discountGiven: Number(discountGiven._sum.discountAmount ?? 0),
    },
    data: coupons,
  }
}

// Get Coupon By Id
const getCouponById = async (couponId: string) => {
  const coupon = await prisma.coupon.findFirst({
    where: {
      id: couponId,
      isDeleted: false,
    },
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
      applicablePlans: {
        select: {
          plan: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
      affiliate: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      affiliateCommissionType: true,
      affiliateCommissionValue: true,
    },
  })

  if (!coupon) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coupon not found')
  }

  return coupon
}

// Update Coupon
const updateCoupon = async (couponId: string, payload: TUpdateCoupon) => {
  const { applicablePlanIds, affiliateEmail, affiliateName, affiliateCommissionType, affiliateCommissionValue, ...couponData } = payload

  const existingCoupon = await prisma.coupon.findFirst({
    where: { id: couponId, isDeleted: false },
    select: { id: true },
  })

  if (!existingCoupon) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coupon not found')
  }

  if (couponData.code) {
    couponData.code = normalizeCouponCode(couponData.code)

    const duplicateCoupon = await prisma.coupon.findFirst({
      where: {
        code: couponData.code,
        id: {
          not: couponId,
        },
      },
      select: { id: true },
    })

    if (duplicateCoupon) {
      throw new AppError(httpStatus.CONFLICT, 'Coupon code already exists')
    }
  }

  if (applicablePlanIds) {
    const activePlans = await prisma.subscriptionPlan.findMany({
      where: {
        id: {
          in: applicablePlanIds,
        },
        isActive: true,
      },
      select: { id: true },
    })

    if (activePlans.length !== applicablePlanIds.length) {
      throw new AppError(httpStatus.BAD_REQUEST, 'One or more subscription plans are invalid')
    }
  }

  const updatedCoupon = await prisma.$transaction(async (tx) => {
    if (applicablePlanIds) {
      await tx.couponApplicablePlan.deleteMany({
        where: { couponId },
      })

      await tx.couponApplicablePlan.createMany({
        data: applicablePlanIds.map((planId: string) => ({
          couponId,
          planId,
        })),
      })
    }

    return tx.coupon.update({
      where: { id: couponId },
      data: {
        ...(couponData.code !== undefined && { code: couponData.code }),
        ...(couponData.discountType !== undefined && { discountType: couponData.discountType }),
        ...(couponData.discountValue !== undefined && { discountValue: couponData.discountValue }),
        ...(couponData.maxDiscountAmount !== undefined && {
          maxDiscountAmount: couponData.maxDiscountAmount,
        }),
        ...(couponData.minimumAmount !== undefined && {
          minimumAmount: couponData.minimumAmount,
        }),
        ...(couponData.startsAt !== undefined && {
          startsAt: new Date(couponData.startsAt),
        }),
        ...(couponData.expiresAt !== undefined && {
          expiresAt: new Date(couponData.expiresAt),
        }),
        ...(couponData.usageLimit !== undefined && { usageLimit: couponData.usageLimit }),
        ...(couponData.perUserLimit !== undefined && { perUserLimit: couponData.perUserLimit }),
        ...(couponData.isActive !== undefined && { isActive: couponData.isActive }),
        ...(affiliateCommissionType !== undefined && { affiliateCommissionType: affiliateCommissionType as CouponDiscountType }),
        ...(affiliateCommissionValue !== undefined && { affiliateCommissionValue }),
      },
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
        applicablePlans: {
          select: {
            plan: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
        affiliate: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
      },
    })
  })

  await invalidateCouponCache(updatedCoupon.code)
  return updatedCoupon
}

// Update Coupon Status
const updateCouponStatus = async (couponId: string, isActive: boolean) => {
  const coupon = await prisma.coupon.findUnique({
    where: {
      id: couponId,
    },
    select: {
      id: true,
      code: true,
      isActive: true,
    },
  })

  if (!coupon) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coupon not found')
  }

  if (coupon.isActive === isActive) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Coupon is already ${isActive ? 'active' : 'inactive'}`
    )
  }

  const result = await prisma.coupon.update({
    where: {
      id: couponId,
    },
    data: {
      isActive,
    },
    select: {
      id: true,
      code: true,
      isActive: true,
    },
  })
  
  await invalidateCouponCache(coupon.code)
  return result
}

// Validate Coupon
const validateCoupon = async (vendorId: string, payload: TValidateCoupon) => {


  const { code, planId, billingCycle } = payload

  const couponCode = normalizeCouponCode(code)
  const now = new Date()

  
  const cacheKey = `coupon:${couponCode}`
  let coupon: any = null
  const cachedCoupon = await redis.get(cacheKey)

  if (cachedCoupon) {
    coupon = JSON.parse(cachedCoupon)
    coupon.startsAt = new Date(coupon.startsAt)
    coupon.expiresAt = new Date(coupon.expiresAt)
  } else {
    coupon = await prisma.coupon.findFirst({
      where: {
        code: couponCode,
        isDeleted: false,
      },
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
        applicablePlans: {
          select: {
            planId: true,
          },
        },
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
      },
    })
    
    if (coupon) {
      await redis.set(cacheKey, JSON.stringify(coupon), 'EX', 3600)
    }
  }

  if (!coupon) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coupon not found')
  }

  if (!coupon.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Coupon is inactive')
  }

  if (coupon.startsAt > now) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Coupon is not active yet')
  }

  if (coupon.expiresAt < now) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Coupon has expired')
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Coupon usage limit exceeded')
  }

  if (coupon.perUserLimit) {
    const userUsageCount = await prisma.couponUsage.count({
      where: {
        couponId: coupon.id,
        vendorId,
      },
    })

    if (userUsageCount >= coupon.perUserLimit) {
      throw new AppError(httpStatus.BAD_REQUEST, 'You have already used this coupon')
    }
  }

  const isApplicableForPlan = coupon.applicablePlans.some((p: any) => p.planId === planId)

  if (!isApplicableForPlan) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Coupon is not applicable for this plan')
  }

  const planPrice = await prisma.subscriptionPlanPrice.findFirst({
    where: {
      planId,
      billingCycle,
      isActive: true,
    },
    select: {
      price: true,
    },
  })

  if (!planPrice) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Subscription plan price not found')
  }

  const originalAmount = Number(planPrice.price)

  if (coupon.minimumAmount && originalAmount < coupon.minimumAmount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum amount for this coupon is ${coupon.minimumAmount}`
    )
  }

  const discountAmount = calculateDiscountAmount({
    amount: originalAmount,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
  })

  const payableAmount = originalAmount - discountAmount

  return {
    couponId: coupon.id,
    code: coupon.code,
    billingCycle,
    originalAmount,
    discountAmount,
    payableAmount,
    affiliateCommissionType: coupon.affiliateCommissionType,
    affiliateCommissionValue: coupon.affiliateCommissionValue,
    message: 'Coupon is valid',
  }
}

// Delete / Archive Coupon
const archiveCoupon = async (couponId: string) => {
  const coupon = await prisma.coupon.findUnique({
    where: {
      id: couponId,
    },
    select: {
      id: true,
      code: true,
      usedCount: true,
      isDeleted: true,
    },
  })

  if (!coupon) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coupon not found')
  }

  if (coupon.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Coupon is already archived')
  }

  if (coupon.usedCount === 0) {
    await prisma.couponApplicablePlan.deleteMany({
      where: {
        couponId,
      },
    })

    await prisma.coupon.delete({
      where: {
        id: couponId,
      },
    })

    return {
      id: coupon.id,
      code: coupon.code,
      deletedType: 'HARD_DELETE',
    }
  }

  const archivedCoupon = await prisma.coupon.update({
    where: {
      id: couponId,
    },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
    },
    select: {
      id: true,
      code: true,
      isActive: true,
      isDeleted: true,
      deletedAt: true,
    },
  })

  await invalidateCouponCache(coupon.code)

  return {
    ...archivedCoupon,
    deletedType: 'ARCHIVED',
  }
}

const getPublicCouponDetails = async (code: string) => {
  const couponCode = normalizeCouponCode(code)
  const now = new Date()

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: couponCode,
      isDeleted: false,
      isActive: true,
      startsAt: { lte: now },
      expiresAt: { gte: now },
    },
    select: {
      id: true,
      code: true,
      discountType: true,
      discountValue: true,
      maxDiscountAmount: true,
      minimumAmount: true,
      applicablePlans: {
        select: {
          planId: true,
        },
      },
    },
  })

  if (!coupon) {
    throw new AppError(httpStatus.NOT_FOUND, 'Invalid or expired coupon code')
  }

  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
    minimumAmount: coupon.minimumAmount,
    applicablePlanIds: coupon.applicablePlans.map((p) => p.planId),
  }
}

export const CouponService = {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  updateCouponStatus,
  validateCoupon,
  archiveCoupon,
  deleteCoupon: archiveCoupon,
  getPublicCouponDetails,
}
