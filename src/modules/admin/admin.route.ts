import { Router } from 'express'
import { AdminController } from './admin.controller.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'

const router: Router = Router()
router.get(
  '/get-all-vendor',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.getAllVendor
)
router.get(
  '/get-trash-vendor',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.getTrashVendor
)

router.patch(
  '/update-vendor-status/:id',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.updateVendorStatus
)

router.delete(
  '/delete-vendor-profile/:id',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.deleteVendor
)

router.patch(
  '/restore-vendor/:id',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.restoreVendor
)

router.get(
  '/get-all-orders',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.getAllOrders
)

router.get(
  '/get-order-stats/:vendorId',

  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.getVendorStats
)

// admin impersonate vendor — credential ছাড়াই vendor account এ login করার token পাওয়ার route
router.post(
  '/impersonate/:vendorId',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.impersonateVendor
)

// admin panel এ impersonation logs দেখানোর route
// কোন admin কোন vendor account এ কখন ঢুকেছে সেই history
router.get(
  '/get-impersonation-logs',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  AdminController.getImpersonationLogs
)

export const AdminRoutes = router
