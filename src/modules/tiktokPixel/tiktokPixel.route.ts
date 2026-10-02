import express, { Router } from 'express'
import { TiktokPixelController } from './tiktokPixel.controller.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'
import { validateSchema } from '../../middleware/validateRequest.js'
import {
  saveTiktokPixelSchema,
  trackTiktokEventSchema,
} from './tiktokPixel.validation.js'

const router = express.Router()

// Public Storefront Routes
router.post(
  '/track-event/:vendorId',
  validateSchema(trackTiktokEventSchema),
  TiktokPixelController.trackDynamicEvent
)
router.post('/:vendorId/track', TiktokPixelController.trackEvent)

// Vendor Protected Routes
router.post(
  '/setup',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  validateSchema(saveTiktokPixelSchema),
  TiktokPixelController.updateCredentials
)

router.post(
  '/credentials',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  validateSchema(saveTiktokPixelSchema),
  TiktokPixelController.updateCredentials
)

router.get(
  '/credentials',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  TiktokPixelController.getCredentials
)

router.delete(
  '/credentials',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  TiktokPixelController.deleteCredentials
)

router.get(
  '/stats',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  TiktokPixelController.getEventStats
)

export const TiktokPixelRoutes: Router = router
