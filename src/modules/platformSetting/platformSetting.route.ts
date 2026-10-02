import { UserRole } from '@prisma/client'
import express from 'express'

import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { PlatformSettingController } from './platformSetting.controller.js'
import { PlatformSettingValidation } from './platformSetting.validation.js'

const router: express.Router = express.Router()

router.get('/', PlatformSettingController.getSettings)

router.get('/public-stats', PlatformSettingController.getPublicStats)

router.patch(
  '/',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateSchema(PlatformSettingValidation.updateSettingsSchema),
  PlatformSettingController.updateSettings
)

router.post(
  '/fraud-api-key',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  PlatformSettingController.updateFraudCheckerApiKey
)

router.get(
  '/fraud-plan-details',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  PlatformSettingController.getPlatformSettingsWithAlert
)

export const PlatformSettingRoutes = router