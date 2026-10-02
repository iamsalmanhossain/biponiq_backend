import { Router } from 'express'
import { VisitorLimitTopupController } from './visitorLimitTopup.controller.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRole } from '../../middleware/rbac.middleware.js'
import { UserRole } from '@prisma/client'
import { validateSchema } from '../../middleware/validateRequest.js'
import {
  createVisitorPackageSchema,
  updateVisitorPackageSchema,
} from './visitorLimitTopup.zod.js'

const router = Router()

// All routes below need authentication
router.use(authenticate)

// --- Admin Routes ---
router.post(
  '/admin/packages',
  authorizeRole(UserRole.ADMIN),
  validateSchema(createVisitorPackageSchema),
  VisitorLimitTopupController.createPackage
)
router.get(
  '/admin/packages',
  authorizeRole(UserRole.ADMIN),
  VisitorLimitTopupController.getAllPackagesForAdmin
)
router.patch(
  '/admin/packages/:packageId',
  authorizeRole(UserRole.ADMIN),
  validateSchema(updateVisitorPackageSchema),
  VisitorLimitTopupController.updatePackage
)
router.delete(
  '/admin/packages/:packageId',
  authorizeRole(UserRole.ADMIN),
  VisitorLimitTopupController.deletePackage
)

// --- Vendor Routes ---
router.get(
  '/packages',
  authorizeRole(UserRole.VENDOR),
  VisitorLimitTopupController.getPackages
)
router.post(
  '/checkout',
  authorizeRole(UserRole.VENDOR),
  VisitorLimitTopupController.checkout
)

export const VisitorLimitTopupRoutes: Router = router
