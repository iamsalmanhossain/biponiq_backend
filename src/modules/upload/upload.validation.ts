import { z } from 'zod'

export const createImageValidationSchema = z
  .object({
    productId: z.uuid({
      error: 'Product ID must be a valid UUID',
    }),
  })
  .strict()

export const updateImageValidationSchema = z.object({}).strict()

// types
export type CreateImageValidationType = z.infer<typeof createImageValidationSchema>
export type UpdateImageValidationType = z.infer<typeof updateImageValidationSchema>
