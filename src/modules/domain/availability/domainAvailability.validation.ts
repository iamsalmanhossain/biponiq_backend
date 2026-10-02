import z from 'zod'

import { ALLOWED_DOMAIN_EXTENSIONS } from '../domain.constants.js'

const checkDomainAvailabilitySchema = z.object({
  domainName: z
    .string()
    .trim()
    .min(1, 'Domain name is required')
    .max(63, 'Domain name cannot exceed 63 characters'),

  extensions: z
    .array(
      z.enum(ALLOWED_DOMAIN_EXTENSIONS, {
        message: 'Unsupported domain extension',
      })
    )
    .min(1, 'Select at least one domain extension')
    .max(
      ALLOWED_DOMAIN_EXTENSIONS.length,
      `You can check up to ${ALLOWED_DOMAIN_EXTENSIONS.length} domain extensions at a time`
    ),
})

export type CheckDomainAvailabilityPayload = z.infer<typeof checkDomainAvailabilitySchema>

export const DomainAvailabilityValidation = {
  checkDomainAvailabilitySchema,
}
