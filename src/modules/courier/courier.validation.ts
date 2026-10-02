import z from 'zod'
import { CourierProvider } from '@prisma/client'

export const SaveCredentialsSchema = z.object({
  provider: z.nativeEnum(CourierProvider),
  credentials: z
    .record(z.string(), z.any())
    .refine(
      (val) => Object.keys(val).length > 0,
      'Credentials object cannot be empty'
    ),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export const CreateOrderSchema = z.object({
  orderId: z.string().optional().nullable(),
  provider: z.nativeEnum(CourierProvider),
  invoice: z.string().min(1, 'Invoice reference is required'),
  recipientName: z.string().min(1, 'Recipient name is required'),
  recipientPhone: z.string().min(1, 'Recipient phone is required'),
  recipientAddress: z.string().min(1, 'Recipient address is required'),
  codAmount: z.coerce.number().min(0, 'COD amount must be non-negative'),
  note: z.string().optional().nullable(),
  itemDescription: z.string().optional().nullable(),
  deliveryAreaId: z.coerce.number().optional().nullable(),
  cityId: z.coerce.number().optional().nullable(),
  zoneId: z.coerce.number().optional().nullable(),
  areaId: z.coerce.number().optional().nullable(),
  recipientSecondaryPhone: z.string().optional().nullable(),
  storeId: z.coerce.number().optional().nullable(),
  deliveryType: z.coerce.number().optional().nullable(),
  itemType: z.coerce.number().optional().nullable(),
  itemWeight: z.coerce.number().optional().nullable(),
  itemQuantity: z.coerce.number().optional().nullable(),
  isClosedBox: z.boolean().optional().nullable(),
  isExchange: z.boolean().optional().nullable(),
})

export const GetCourierOrdersQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  provider: z.nativeEnum(CourierProvider).optional(),
  status: z.string().optional(),
  searchTerm: z.string().optional(),
  orderId: z.string().optional(),
})

export const CourierValidation = {
  SaveCredentialsSchema,
  CreateOrderSchema,
  GetCourierOrdersQuerySchema,
}


