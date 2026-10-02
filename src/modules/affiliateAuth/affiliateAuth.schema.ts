import { z } from 'zod'

export const affiliateLoginSchema = z.object({

    email: z.email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters long').max(72, 'Password must not exceed 72 characters'),

})

export const forgotPasswordSchema = z.object({

    email: z.email('Invalid email'),

})

export const resetPasswordSchema = z.object({

    email: z.email('Invalid email'),
    code: z.string().length(6, 'Code must be 6 digits'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters long').max(72, 'Password must not exceed 72 characters'),
 
})
