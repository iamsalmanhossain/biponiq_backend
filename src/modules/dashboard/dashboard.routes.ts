import { Router } from 'express'
import { AdminDashboardController } from './admin/dashboardAdmin.controller.js'
import { VendorDashboardController } from './vendor/dashboardVendor.controller.js'
import { CustomerDashboardController } from './customer/dashboardCustomer.controller.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { deliveryChargeBody } from './vendor/dashboardVendor.schema.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'
import { MarketingController } from './marcketing/marcketing.controller.js'
import { CustomDomainController } from './vendor/customDomain/customDomain.controller.js'
import { FraudCheckerController } from './vendor/fraudChecker/fraudChecker.controller.js'
import { CourierValidation } from './vendor/fraudChecker/fraudChecker.validation.js'
import { VendorCouponController } from './vendor/vendorCoupon/vendorCoupon.controller.js'
import {
  createVendorCouponSchema,
  updateVendorCouponSchema,
} from './vendor/vendorCoupon/vendorCoupon.schema.js'
import { VendorAffiliateController } from './vendor/vendorAffiliate/vendorAffiliate.controller.js'
import { approvePayoutSchema } from './vendor/vendorAffiliate/vendorAffiliate.schema.js'
import { AffiliateDashboardController } from './affiliate/dashboardAffiliate.controller.js'
import {
  updateProfileSchema,
  changePasswordSchema,
  addPayoutMethodSchema,
  requestPayoutSchema,
} from './affiliate/dashboardAffiliate.schema.js'
import { blockManualCustomDomainForPurchasedDomain } from '../domain/dashboard/managedPurchasedDomain.guard.js'
import { AdminMarketingController } from './admin/marketing/marketing.controller.js'
import { TiktokPixelController } from '../tiktokPixel/tiktokPixel.controller.js'
import { saveTiktokPixelSchema } from '../tiktokPixel/tiktokPixel.validation.js'

const router: Router = Router()

// Public: customer event tracking
router.post('/track-event/:vendorId', MarketingController.trackDynamicEvent)
router.post('/track-tiktok-event/:vendorId', TiktokPixelController.trackDynamicEvent)

router.get(
  '/admin/marketing/pixel',
  // authorizeRoles(UserRole.ADMIN),
  AdminMarketingController.getAdminPixelCredentials
)


router.use(authenticate)

// Admin Dashboard
router.get('/admin', authorizeRoles(UserRole.ADMIN), AdminDashboardController.adminDashboardStats)
router.get('/admin/vendors', authorizeRoles(UserRole.ADMIN), AdminDashboardController.getVendorList)
router.get(
  '/admin/vendors/:vendorId',
  authorizeRoles(UserRole.ADMIN),
  AdminDashboardController.getVendorDetails
)
router.get(
  '/admin/customers',
  authorizeRoles(UserRole.ADMIN),
  AdminDashboardController.getGuestCustomerList
)
router.patch(
  '/admin/admin-account-status/:id',
  authorizeRoles(UserRole.ADMIN),
  AdminDashboardController.updateAdminAccountStatus
)
router.get(
  '/admin/affiliates',
  authorizeRoles(UserRole.ADMIN),
  AdminDashboardController.getAffiliatesPerformance
)
router.get(
  '/admin/affiliates/payouts',
  authorizeRoles(UserRole.ADMIN),
  AdminDashboardController.getAffiliatePayoutRequests
)
router.post(
  '/admin/affiliates/payouts/:payoutId/approve',
  authorizeRoles(UserRole.ADMIN),
  validateSchema(approvePayoutSchema),
  AdminDashboardController.approveAffiliatePayout
)


// admin marketing
router.post(
  '/admin/marketing/setup-pixel',
  authorizeRoles(UserRole.ADMIN),
  AdminMarketingController.setUpPixel
)

router.delete(
  '/admin/marketing/pixel',
  authorizeRoles(UserRole.ADMIN),
  AdminMarketingController.deleteAdminPixelCredentials
)

// Vendor Dashboard
router.get(
  '/vendor',
  authorizeRoles(UserRole.VENDOR),
  VendorDashboardController.vendorDashboardStats
)
router.get(
  '/vendor/orders',
  authorizeRoles(UserRole.VENDOR),
  VendorDashboardController.getVendorOrders
)
router.patch(
  '/vendor/delivery-charge',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(deliveryChargeBody),
  VendorDashboardController.vendorDeliveryCharge
)
router.get(
  '/vendor/customers',
  authorizeRoles(UserRole.VENDOR),
  VendorDashboardController.getGuestCustomerList
)
router.get(
  '/vendor/social-links',
  authorizeRoles(UserRole.VENDOR),
  VendorDashboardController.getSocialLinks
)
router.patch(
  '/vendor/social-links',
  authorizeRoles(UserRole.VENDOR),
  VendorDashboardController.updateSocialLinks
)

// Customer Dashboard
router.get('/customer', authenticate, CustomerDashboardController.customerDashboardStats)
router.get('/customer/orders', authenticate, CustomerDashboardController.getOrderDetail)

// Facebook marketing pixel
router.post('/setup-pixel', MarketingController.updateCredentials)

// TikTok marketing pixel
router.post(
  '/setup-tiktok-pixel',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(saveTiktokPixelSchema),
  TiktokPixelController.updateCredentials
)

// Custom domain management
router.post(
  '/add-domain',
  authorizeRoles(UserRole.VENDOR),
  blockManualCustomDomainForPurchasedDomain,
  CustomDomainController.addDomain
)
router.post(
  '/verify-domain',
  authorizeRoles(UserRole.VENDOR),
  blockManualCustomDomainForPurchasedDomain,
  CustomDomainController.verifyDomain
)
router.delete(
  '/delete-domain',
  authorizeRoles(UserRole.VENDOR),
  blockManualCustomDomainForPurchasedDomain,
  CustomDomainController.deleteDomain
)
router.get('/get-domain', authorizeRoles(UserRole.VENDOR), CustomDomainController.getCustomDomain)

// Fraud checker
router.patch(
  '/api-key',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(CourierValidation.apiKeyBody),
  FraudCheckerController.addApiKey
)
router.post(
  '/check-fraud',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(CourierValidation.checkFraudBody),
  FraudCheckerController.checkFraudStatus
)

router.get(
  '/fraud-plan-details',
  authorizeRoles(UserRole.VENDOR),
  FraudCheckerController.getVendorPlanDetails
)


// Vendor Coupons
router.post(
  '/vendor/coupons',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(createVendorCouponSchema),
  VendorCouponController.createVendorCoupon
)
router.get(
  '/vendor/coupons',
  authorizeRoles(UserRole.VENDOR),
  VendorCouponController.getVendorCoupons
)
router.get(
  '/vendor/coupons/:couponId',
  authorizeRoles(UserRole.VENDOR),
  VendorCouponController.getVendorCouponById
)
router.patch(
  '/vendor/coupons/:couponId',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(updateVendorCouponSchema),
  VendorCouponController.updateVendorCoupon
)
router.delete(
  '/vendor/coupons/:couponId',
  authorizeRoles(UserRole.VENDOR),
  VendorCouponController.deleteVendorCoupon
)

// Vendor Affiliate Management
router.get(
  '/vendor/affiliates',
  authorizeRoles(UserRole.VENDOR),
  VendorAffiliateController.getAffiliates
)
router.get(
  '/vendor/affiliates/:id/orders',
  authorizeRoles(UserRole.VENDOR),
  VendorAffiliateController.getAffiliateOrders
)
router.post(
  '/vendor/affiliates/payouts/:payoutId/approve',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(approvePayoutSchema),
  VendorAffiliateController.approvePayout
)

// Affiliate Dashboard
router.get(
  '/affiliate',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.getDashboard
)
router.get(
  '/affiliate/coupons',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.getCoupons
)
router.get(
  '/affiliate/orders',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.getOrders
)
router.get(
  '/affiliate/payouts',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.getPayouts
)
router.post(
  '/affiliate/payouts/request',
  authorizeRoles(UserRole.AFFILIATE),
  validateSchema(requestPayoutSchema),
  AffiliateDashboardController.requestPayout
)
router.get(
  '/affiliate/settings/profile',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.getProfile
)
router.patch(
  '/affiliate/settings/profile',
  authorizeRoles(UserRole.AFFILIATE),
  validateSchema(updateProfileSchema),
  AffiliateDashboardController.updateProfile
)
router.patch(
  '/affiliate/settings/change-password',
  authorizeRoles(UserRole.AFFILIATE),
  validateSchema(changePasswordSchema),
  AffiliateDashboardController.changePassword
)
router.get(
  '/affiliate/settings/payout-methods',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.getPayoutMethods
)
router.post(
  '/affiliate/settings/payout-methods',
  authorizeRoles(UserRole.AFFILIATE),
  validateSchema(addPayoutMethodSchema),
  AffiliateDashboardController.addPayoutMethod
)
router.delete(
  '/affiliate/settings/payout-methods/:id',
  authorizeRoles(UserRole.AFFILIATE),
  AffiliateDashboardController.deletePayoutMethod
)




export const DashboardRoutes = router
