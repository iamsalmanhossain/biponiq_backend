import z from 'zod'

export const registerAdminSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters long')
    .max(72, 'Password must not exceed 72 characters'),
  phone: z.string().regex(/^(?:\+8801|8801|01)[3-9]\d{8}$/),
  avatar: z.url().optional().or(z.literal('')),
  avatarKey: z.string().optional().or(z.literal('')),
})

export const registerVendorSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters long')
    .max(72, 'Password must not exceed 72 characters'),
  phone: z.string().regex(/^(?:\+8801|8801|01)[3-9]\d{8}$/),
  avatar: z.url().optional().or(z.literal('')),
  avatarKey: z.string().optional().or(z.literal('')),

  shopName: z.string().min(1),
  area: z.string().min(1),
  divisionName: z.string().min(1),
  districtName: z.string().min(1),
  shopLogo: z.url().optional().or(z.literal('')),
  shopLogoKey: z.string().optional().or(z.literal('')),
  subDomain: z.string().min(3),
})

export const loginSchema = z.object({
  email: z.email({
    message: 'Please enter a valid email address',
  }),
  password: z.string().min(6, 'Password must be at least 6 characters long')
  .max(72, 'Password must not exceed 72 characters'),
  device_token: z.string().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.email(),
})

export const resetPasswordSchema = z.object({
  email: z.email({
    message: 'Please enter a valid email address',
  }),

  code: z.string().length(6, 'Code must be 6 digits'),

  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must not exceed 72 characters'),
})

export type RegisterAdmin = z.infer<typeof registerAdminSchema>
export type RegisterVendor = z.infer<typeof registerVendorSchema>
export type LoginUser = z.infer<typeof loginSchema>
export type ForgetPassword = z.infer<typeof forgotPasswordSchema>
export type ResetPassword = z.infer<typeof resetPasswordSchema>
