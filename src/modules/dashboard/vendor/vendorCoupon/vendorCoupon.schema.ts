import { z } from 'zod'

export const createVendorCouponSchema = z.object({
 
    code: z.string().min(1, 'Coupon code is required'),
    discountType: z.enum(["PERCENTAGE" , "FIXED"]),
    discountValue: z.number().positive(),
    maxDiscountAmount: z.number().positive().optional(),
    minimumAmount: z.number().positive().optional(),
    startsAt: z.string().min(1, 'Start date is required'),
    expiresAt: z.string().min(1, 'Expiry date is required'),
    usageLimit: z.number().positive().optional(),
    isActive: z.boolean().optional(),
    
    // Affiliate details
    affiliateName: z.string().min(1, 'Affiliate name is required'),
    affiliateEmail: z.email('Affiliate email is required'),
    affiliatePassword: z.string().min(8, 'Password must be at least 8 characters long').max(72, 'Password must not exceed 72 characters').optional(),
    affiliateCommissionType: z.enum(["PERCENTAGE" , "FIXED"]).optional(),
    affiliateCommissionValue: z.number().positive().optional(),
    
    // Template binding
    applicableTemplateIds: z.array(z.string()).optional(),
})

export const updateVendorCouponSchema = z.object({

    discountType: z.enum(["PERCENTAGE" , "FIXED"]).optional(),
    discountValue: z.number().positive().optional(),
    maxDiscountAmount: z.number().positive().optional(),
    minimumAmount: z.number().positive().optional(),
    startsAt: z.string().optional(),
    expiresAt: z.string().optional(),
    usageLimit: z.number().positive().optional(),
    isActive: z.boolean().optional(),
    affiliateCommissionType: z.enum(["PERCENTAGE" , "FIXED"]).optional(),
    affiliateCommissionValue: z.number().positive().optional(),
    applicableTemplateIds: z.array(z.string()).optional(),
})

export type CreateVendorCouponPayload = z.infer<typeof createVendorCouponSchema>
export type UpdateVendorCouponPayload = z.infer<typeof updateVendorCouponSchema>
