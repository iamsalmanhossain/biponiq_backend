import z from 'zod'

const updateSettingsSchema = z.object({
  enableCod: z.boolean().optional(),
  enableSsl: z.boolean().optional(),
  enableEps: z.boolean().optional(),
  enableMfs: z.boolean().optional(),
  enableFraudChecker: z.boolean().optional(),
  enableCoupons: z.boolean().optional(),
  enableDeliverySupport: z.boolean().optional(),
  enableManagedDomainPurchase: z.boolean().optional(),
})

export const PlatformSettingValidation = {
  updateSettingsSchema,
}