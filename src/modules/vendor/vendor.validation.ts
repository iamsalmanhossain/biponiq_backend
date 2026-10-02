import { z } from 'zod'

export const VendorUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),

  avatar: z.string('Avatar must be a valid URL').optional(),

  shopName: z.string().min(1, 'Shop name must be at least 1 characters').optional(),

  shopLogo: z.string('Shop logo must be a valid URL').optional(),

  phone: z.string().min(11, 'Phone number must be at least 11 digits').optional(),

  pageConfig: z.record(z.string(), z.any()).optional(),

  draftConfig: z.record(z.string(), z.any()).optional(),
})

export type TVendorUpdate = z.infer<typeof VendorUpdateSchema>
