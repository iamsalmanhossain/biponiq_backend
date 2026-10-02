import { CouponDiscountType, SubscriptionBillingCycle } from '@prisma/client'
import { z } from 'zod'

const createCoupon = z
  .object({
    code: z.string().trim().min(3).max(50),

    discountType: z.enum(CouponDiscountType),
    discountValue: z.number().positive(),

    maxDiscountAmount: z.number().positive().optional(),
    minimumAmount: z.number().min(0).optional(),

    startsAt: z.string().datetime(),
    expiresAt: z.string().datetime(),

    usageLimit: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),

    isActive: z.boolean().optional(),
    
    affiliateEmail: z.string().email().optional(),
    affiliateName: z.string().min(2).max(100).optional(),
    affiliateCommissionType: z.enum(CouponDiscountType).optional(),
    affiliateCommissionValue: z.number().min(0).optional(),

    applicablePlanIds: z.array(z.string().uuid()).min(1),
  })
  .refine(
    (data) => data.discountType !== CouponDiscountType.PERCENTAGE || data.discountValue <= 100,
    {
      message: 'Percentage discount cannot be greater than 100',
      path: ['discountValue'],
    }
  )
  .refine((data) => new Date(data.expiresAt) > new Date(data.startsAt), {
    message: 'Expiry date must be after start date',
    path: ['expiresAt'],
  })

const updateCoupon = z
  .object({
    code: z.string().trim().min(3).max(50).optional(),

    discountType: z.enum(CouponDiscountType).optional(),
    discountValue: z.number().positive().optional(),

    maxDiscountAmount: z.number().positive().optional(),
    minimumAmount: z.number().min(0).optional(),

    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),

    usageLimit: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),

    isActive: z.boolean().optional(),

    affiliateEmail: z.string().email().optional(),
    affiliateName: z.string().min(2).max(100).optional(),
    affiliateCommissionType: z.enum(CouponDiscountType).optional(),
    affiliateCommissionValue: z.number().min(0).optional(),

    applicablePlanIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (data) =>
      data.discountType !== CouponDiscountType.PERCENTAGE ||
      data.discountValue === undefined ||
      data.discountValue <= 100,
    {
      message: 'Percentage discount cannot be greater than 100',
      path: ['discountValue'],
    }
  )
  .refine(
    (data) => {
      if (!data.startsAt || !data.expiresAt) return true
      return new Date(data.expiresAt) > new Date(data.startsAt)
    },
    {
      message: 'Expiry date must be after start date',
      path: ['expiresAt'],
    }
  )

const validateCoupon = z.object({
  code: z.string().trim().min(3).max(50),
  planId: z.string().uuid(),
  billingCycle: z.enum(SubscriptionBillingCycle),
})

const updateCouponStatus = z.object({
  isActive: z.boolean(),
})

export type TCreateCoupon = z.infer<typeof createCoupon>
export type TUpdateCoupon = z.infer<typeof updateCoupon>
export type TValidateCoupon = z.infer<typeof validateCoupon>

export const CouponValidation = {
  createCoupon,
  updateCoupon,
  validateCoupon,
  updateCouponStatus,
}
