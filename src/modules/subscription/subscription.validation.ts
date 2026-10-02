import { SubscriptionBillingCycle } from '@prisma/client'
import { z } from 'zod'

export const subscriptionPlanTypeValues = [
  'FREE_TRIAL',
  'INSTALLMENT',
  'STANDARD',
  'MEDIUM',
  'PREMIUM',
] as const

export const subscriptionPriceSchema = z.object({
  billingCycle: z.enum(SubscriptionBillingCycle),

  price: z.number().min(0, 'Price cannot be negative'),

  discountPercent: z
    .number()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot be more than 100')
    .optional(),

  durationDays: z.number().int().min(1, 'Duration must be at least 1 day'),

  isActive: z.boolean().optional(),
})

export const createSubscriptionPlanSchema = z.object({
  name: z.string().min(2, 'Plan name is required'),
  nameBn: z.string().nullable().optional(),

  type: z.enum(subscriptionPlanTypeValues),

  isActive: z.boolean().optional(),
  isTrial: z.boolean().optional(),
  displayOrder: z.number().int().min(0, 'Display order must be zero or greater').optional(),
  isMostPopular: z.boolean().optional(),
  visitorLimit: z
    .number()
    .int('Visitor limit must be a whole number')
    .min(0, 'Visitor limit must be zero or greater')
    .nullable()
    .optional(),

  description: z.string().nullable().optional(),
  descriptionBn: z.string().nullable().optional(),

  prices: z.array(subscriptionPriceSchema).min(1, 'At least one price is required'),
})

export const updateSubscriptionPlanSchema = z.object({
  name: z.string().min(2, 'Plan name is required').optional(),
  nameBn: z.string().nullable().optional(),

  isActive: z.boolean().optional(),
  isTrial: z.boolean().optional(),
  displayOrder: z.number().int().min(0, 'Display order must be zero or greater').optional(),
  isMostPopular: z.boolean().optional(),
  visitorLimit: z
    .number()
    .int('Visitor limit must be a whole number')
    .min(0, 'Visitor limit must be zero or greater')
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
  descriptionBn: z.string().nullable().optional(),

  prices: z.array(subscriptionPriceSchema).optional(),
})

export const saveCheckoutDraftSchema = z.object({
  planId: z.string().uuid('Invalid plan id'),

  billingCycle: z.enum(SubscriptionBillingCycle),
})

export const applyCheckoutDraftCouponSchema = z.object({
  code: z.string().trim().min(3).max(50),
})

export const saveCheckoutDraftDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, 'Domain is required')
    .max(70, 'Domain cannot exceed 70 characters'),
})

export const checkoutSubscriptionSchema = z
  .object({
    includeDomain: z.boolean({
      message: 'includeDomain must be a boolean',
    }),

    paymentMethod: z.enum(['SSLCOMMERZ', 'EPS']),
  })
  .strict()

export const cancelSubscriptionSchema = z.object({
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
})

export type CreateSubscriptionPlan = z.infer<typeof createSubscriptionPlanSchema>
export type UpdateSubscriptionPlan = z.infer<typeof updateSubscriptionPlanSchema>
export type SaveCheckoutDraft = z.infer<typeof saveCheckoutDraftSchema>
export type SaveCheckoutDraftDomain = z.infer<typeof saveCheckoutDraftDomainSchema>
export type ApplyCheckoutDraftCoupon = z.infer<typeof applyCheckoutDraftCouponSchema>
export type CheckoutSubscription = z.infer<typeof checkoutSubscriptionSchema>
export type CancelSubscription = z.infer<typeof cancelSubscriptionSchema>
