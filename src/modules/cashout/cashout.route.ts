import { Router } from 'express'
import { CashoutController } from './cashout.controller.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { CashoutValidation } from './cashout.validation.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'
import { authenticate } from '../../middleware/authinticate.js'

const router: Router = Router()

// Vendor Routes
router.get(
  '/vendor/summary',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  CashoutController.getCashoutSummary
)

router.post(
  '/vendor/request',
  authenticate,
  authorizeRoles(UserRole.VENDOR),
  validateSchema(CashoutValidation.createCashoutSchema),
  CashoutController.createCashout
)

// Admin  Routes
router.get(
  '/admin/settings',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  CashoutController.getCashoutSetting
)
router.patch(
  '/admin/settings',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateSchema(CashoutValidation.updateCashoutSettingSchema),
  CashoutController.updateCashoutSetting
)

router.get(
  '/admin/cashouts',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  CashoutController.getCashoutsForAdmin
)
router.patch(
  '/admin/cashouts/:id/status',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateSchema(CashoutValidation.updateCashoutStatusSchema),
  CashoutController.updateCashoutStatus
)
export const CashoutRoutes = router
