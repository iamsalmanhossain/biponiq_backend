import { z } from 'zod'

const checkFraudBody = z.object({
  phone: z
    .string()
    .max(11, { message: 'Phone number must be 11 digits long' })
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, {
      message: 'Invalid Bangladeshi phone number format',
    }),
})



const apiKeyBody = z.object({
    bdCourierApiKey: z
      .string()
      .min(5, { message: 'Please provide a valid API Key'}), 
})

export const CourierValidation = {
  checkFraudBody,
  apiKeyBody
}

