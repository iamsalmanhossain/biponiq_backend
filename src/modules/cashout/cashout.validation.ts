import { CashoutMethod, CashoutStatus } from '@prisma/client'
import z from 'zod'

const bdMobileRegex = /^01[3-9]\d{8}$/

// vendor cashout schema
const createCashoutSchema = z.object({
  amount: z.coerce.number(),

  method: z.enum(CashoutMethod),

  accountHolderName: z.string().min(3, 'Account holder name is required'),

  accountNumber: z.string().regex(bdMobileRegex, 'Invalid Bangladeshi mobile number.'),
})

// admin cashout schema
const updateCashoutStatusSchema = z.object({
  status: z.enum([CashoutStatus.COMPLETED, CashoutStatus.REJECTED, CashoutStatus.FAILED]),
  adminTransactionId: z.string().optional(),
  rejectionReason: z.string().optional(),
  failureReason: z.string().optional(),
})

const updateCashoutSettingSchema = z.object({
  chargeRate: z.number().positive().optional(),
  minimumCashoutAmount: z.number().min(1).optional(),
  allowedMethods: z.array(z.string()).optional(),
})

export type UpdateCashoutStatusPayload = z.infer<typeof CashoutValidation.updateCashoutStatusSchema>

export type UpdateCashoutSettingsPayload = z.infer<typeof updateCashoutSettingSchema>

export const CashoutValidation = {
  createCashoutSchema,
  updateCashoutStatusSchema,
  updateCashoutSettingSchema,
}
