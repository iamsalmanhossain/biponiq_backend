import { z } from 'zod'

export const userId = z.object({
  vendorId: z.string({ message: 'Invalid Vendor ID format' }),
})

export type userIdType = z.infer<typeof userId>

export const deliveryChargeBody = z.object({
  insideCharge: z
    .number({ message: 'Inside charge must be a number' })
    .nonnegative({ message: 'Inside charge must be a non-negative number' }),
  outsideCharge: z
    .number({ message: 'Outside charge must be a number' })
    .nonnegative({ message: 'Outside charge must be a non-negative number' }),
})
