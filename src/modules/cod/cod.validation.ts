import { z } from 'zod'

export const createCODOrderValidationSchema = z.object({
  productId: z.string().min(1),

  quantity: z.number().min(1),

  price: z.number().min(1),
})
