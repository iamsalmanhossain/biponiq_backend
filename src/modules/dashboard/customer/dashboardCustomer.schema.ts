import { z } from 'zod'

export const customerDashboardParams = z.object({
  userId: z.string({ message: 'Invalid User ID format' }).optional(),
})

export const orderDetailParams = z.object({
  orderId: z.string({ message: 'Invalid Order ID format' }),
})

export type CustomerDashboardParamsType = z.infer<typeof customerDashboardParams>
export type OrderDetailParamsType = z.infer<typeof orderDetailParams>
