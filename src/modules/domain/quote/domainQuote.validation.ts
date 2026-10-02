import z from 'zod'

const getDomainQuoteSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, 'Domain is required')
    .max(70, 'Domain cannot exceed 70 characters'),
})

export type GetDomainQuotePayload = z.infer<typeof getDomainQuoteSchema>

export const DomainQuoteValidation = {
  getDomainQuoteSchema,
}
