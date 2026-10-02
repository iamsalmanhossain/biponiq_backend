import { z } from 'zod'

export const userId = z.object({
  vendorId: z.string({ message: 'Invalid Vendor ID format' }),
})

export type userIdType = z.infer<typeof userId>
