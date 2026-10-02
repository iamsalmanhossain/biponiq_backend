import { z } from 'zod'

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),

  vendorId: z.string().uuid('Invalid vendor ID').optional(),
})

export type SendMessagePayload = z.infer<typeof sendMessageSchema>
