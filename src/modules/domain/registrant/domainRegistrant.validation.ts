import { z } from 'zod'

const requiredText = (fieldName: string, maxLength: number) => {
  return z
    .string({
      message: `${fieldName} is required`,
    })
    .trim()
    .min(1, `${fieldName} is required`)
    .max(maxLength, `${fieldName} must not exceed ${maxLength} characters`)
}

export const saveVendorDomainRegistrantSchema = z
  .object({
    firstName: requiredText('First name', 255),

    lastName: requiredText('Last name', 255),

    organizationName: z
      .string()
      .trim()
      .max(255, 'Organization name must not exceed 255 characters')
      .nullable()
      .optional(),

    address1: requiredText('Address', 255),

    city: requiredText('City', 50),

    stateProvince: requiredText('Division', 50),

    postalCode: requiredText('Postal code', 50),

    phone: z
      .string({
        message: 'Phone number is required',
      })
      .trim()
      .regex(
        /^01[3-9]\d{8}$/,
        'Enter a valid Bangladesh mobile number starting with 01, for example 01880230924'
      ),

    emailAddress: z
      .email({
        message: 'Enter a valid email address',
      })
      .trim()
      .max(255, 'Email address must not exceed 255 characters'),
  })
  .strict()

export const confirmVendorDomainRegistrantSchema = z
  .object({
    registrantUpdatedAt: z
      .string({
        message: 'Registrant update timestamp is required',
      })
      .datetime({
        message: 'Registrant update timestamp must be a valid ISO date',
      }),
  })
  .strict()
