import { z } from 'zod'

export const calculateCommissionValidationSchema = z.object({
  totalAmount: z.number().min(1),

  commissionRate: z.number().min(1),
})
