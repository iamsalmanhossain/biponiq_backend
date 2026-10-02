import { Router } from 'express'

import { validateSchema } from '../../middleware/validateRequest.js'
import { SubscriptionController } from './subscription.controller.js'
import {
  applyCheckoutDraftCouponSchema,
  cancelSubscriptionSchema,
  checkoutSubscriptionSchema,
  createSubscriptionPlanSchema,
  saveCheckoutDraftDomainSchema,
  saveCheckoutDraftSchema,
  updateSubscriptionPlanSchema,
} from './subscription.validation.js'
import { authorizeRole } from '../../middleware/rbac.middleware.js'
import { UserRole } from '@prisma/client'
import { authenticate } from '../../middleware/authinticate.js'

const router = Router()

// Vendor routes
router.get('/plans', SubscriptionController.getActivePlansForVendor)

router.get('/payment-result', SubscriptionController.getSubscriptionPaymentResult)

router.use(authenticate)

router.get(
  '/my-subscription',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.getMySubscription
)

router.get(
  '/trial-status',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.getTrialStatus
)

router.post(
  '/cancel',
  authorizeRole(UserRole.VENDOR),
  validateSchema(cancelSubscriptionSchema),
  SubscriptionController.cancelSubscription
)

router.get(
  '/checkout-draft',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.getCheckoutDraft
)

router.put(
  '/checkout-draft',
  authorizeRole(UserRole.VENDOR),
  validateSchema(saveCheckoutDraftSchema),
  SubscriptionController.saveCheckoutDraft
)

router.patch(
  '/checkout-draft/domain',
  authorizeRole(UserRole.VENDOR),
  validateSchema(saveCheckoutDraftDomainSchema),
  SubscriptionController.saveCheckoutDraftDomain
)

router.delete(
  '/checkout-draft/domain',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.removeCheckoutDraftDomain
)

router.patch(
  '/checkout-draft/coupon',
  authorizeRole(UserRole.VENDOR),
  validateSchema(applyCheckoutDraftCouponSchema),
  SubscriptionController.applyCheckoutDraftCoupon
)

router.delete(
  '/checkout-draft/coupon',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.removeCheckoutDraftCoupon
)

router.post(
  '/checkout',
  authorizeRole(UserRole.VENDOR),
  validateSchema(checkoutSubscriptionSchema),
  SubscriptionController.checkoutPlan
)

router.get(
  '/billing-history',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.getBillingHistory
)

// Admin routes
router.get('/admin/plans', authorizeRole(UserRole.ADMIN), SubscriptionController.getPlansForAdmin)

router.post(
  '/admin/plans',
  authorizeRole(UserRole.ADMIN),
  validateSchema(createSubscriptionPlanSchema),
  SubscriptionController.createPlan
)

router.get(
  '/payments/:paymentId/receipt',
  authorizeRole(UserRole.VENDOR),
  SubscriptionController.downloadSubscriptionReceipt
)

router.patch(
  '/admin/plans/:planId',
  authorizeRole(UserRole.ADMIN),
  validateSchema(updateSubscriptionPlanSchema),
  SubscriptionController.updatePlan
)

router.delete(
  '/admin/plans/:planId',
  authorizeRole(UserRole.ADMIN),
  SubscriptionController.deletePlan
)

router.post(
  '/admin/vendors/:vendorId/trial',
  authorizeRole(UserRole.ADMIN),
  SubscriptionController.createTrialForVendor
)

router.post(
  '/admin/vendors/:vendorId/assign-plan',
  authorizeRole(UserRole.ADMIN),
  SubscriptionController.assignPlanToVendor
)

router.get(
  '/admin/vendors/:vendorId',
  authorizeRole(UserRole.ADMIN),
  SubscriptionController.getVendorSubscriptionForAdmin
)

export const SubscriptionRoutes: Router = router
