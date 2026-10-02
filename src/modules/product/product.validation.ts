import { z } from 'zod'
import { ProductStatus } from '@prisma/client'

const imageSchema = z.string().url('Invalid image URL')

export const createProductValidationSchema = z.object({
  name: z
    .string()
    .min(1, 'Product name is required')
    .min(2, 'Product name must be at least 2 characters long'),

  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL friendly'),

  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(50000, 'Description is too large')
    .optional(),

  price: z.number().positive('Price must be greater than 0'),

  stock: z.number().int().min(0, 'Stock cannot be negative'),

  images: z.array(imageSchema).optional(),
})

export const updateProductValidationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Product name is required')
      .max(255, 'Product name cannot exceed 255 characters')
      .optional(),

    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .max(255, 'Slug cannot exceed 255 characters')
      .optional(),

    description: z
      .string()
      .trim()
      .max(5000, 'Description cannot exceed 5000 characters')
      .optional(),

    price: z
      .number()
      .positive('Price must be greater than 0')
      .optional(),

    stock: z
      .number()
      .int('Stock must be an integer')
      .min(0, 'Stock cannot be negative')
      .optional(),

    status: z
      .enum(ProductStatus)
      .refine(
        status => status !== ProductStatus.OUT_OF_STOCK,
        {
          message:
            'Product status cannot be set to OUT_OF_STOCK manually',
        }
      )
      .optional(),

    images: z.array(z.string().url()).optional(),
  })
  .refine(
    data => {
      if (
        data.status === ProductStatus.ACTIVE &&
        data.stock !== undefined &&
        data.stock <= 0
      ) {
        return false
      }

      return true
    },
    {
      message: 'Active products must have stock greater than 0',
      path: ['stock'],
    }
  )

  
  export type CreateProduct = z.infer<typeof createProductValidationSchema>
  export type UpdateProduct = z.infer<typeof updateProductValidationSchema>
