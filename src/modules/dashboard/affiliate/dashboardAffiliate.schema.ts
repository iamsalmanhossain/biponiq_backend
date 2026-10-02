import { z } from 'zod'

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'Password must be at least 8 characters long').max(72, 'Password must not exceed 72 characters'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long').max(72, 'Password must not exceed 72 characters'),
})

export const addPayoutMethodSchema = z.object({
  methodType: z.enum(['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER', 'PROJECT_GATEWAY']),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  gatewayAccountId: z.string().optional(),
  gatewayToken: z.string().optional(),
  isDefault: z.boolean().optional(),
})

export const requestPayoutSchema = z.object({
  amount: z.number().positive(),
  payoutMethodId: z.string().uuid(),
})
