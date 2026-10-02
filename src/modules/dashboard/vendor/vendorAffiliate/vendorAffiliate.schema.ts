import { z } from 'zod'

export const approvePayoutSchema = z.object({
  status: z.enum(['PAID', 'REJECTED']),
  gatewayResponseCode: z.string().optional()
})
