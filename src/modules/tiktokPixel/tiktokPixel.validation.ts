import { z } from 'zod'

export const saveTiktokPixelSchema = z.object({
  tiktokPixelId: z.string().min(1, 'TikTok Pixel ID is required'),
  tiktokAccessToken: z.string().min(1, 'TikTok Access Token is required'),
  tiktokTestCode: z.string().optional().nullable(),
})

export const trackTiktokEventSchema = z.object({
  eventName: z.string().min(1, 'Event name is required'),
  eventId: z.string().min(1, 'Event ID is required'),
  eventTime: z.number().optional(),
  url: z.string().optional(),
  testEventCode: z.string().optional().nullable(),
  customerData: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      name: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      zipCode: z.string().optional(),
      external_id: z.string().optional(),
      ttclid: z.string().optional(),
      ttp: z.string().optional(),
      client_ip_address: z.string().optional(),
      client_user_agent: z.string().optional(),
    })
    .optional(),
  eventData: z
    .object({
      currency: z.string().optional(),
      value: z.number().optional(),
      contents: z
        .array(
          z.object({
            content_id: z.string().optional(),
            content_name: z.string().optional(),
            content_type: z.string().optional(),
            content_category: z.string().optional(),
            price: z.number().optional(),
            quantity: z.number().optional(),
            description: z.string().optional(),
            brand: z.string().optional(),
          })
        )
        .optional(),
      query: z.string().optional(),
      description: z.string().optional(),
      order_id: z.string().optional(),
      status: z.string().optional(),
    })
    .passthrough()
    .optional(),
})

export type SaveTiktokPixelInput = z.infer<typeof saveTiktokPixelSchema>
export type TrackTiktokEventInput = z.infer<typeof trackTiktokEventSchema>
