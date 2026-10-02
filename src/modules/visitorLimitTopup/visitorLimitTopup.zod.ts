import { z } from 'zod'

export const createVisitorPackageSchema = z.object({

  name: z.string({
    message: 'Name is required',
  }),
  visitorLimit: z.number({
    message: 'Visitor limit is required',
  }).int().positive(),
  price: z.number({
    message: 'Price is required',
  }).nonnegative(),

})

export const updateVisitorPackageSchema = z.object({
    name: z.string().optional(),
    visitorLimit: z.number().int().positive().optional(),
    price: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
})
