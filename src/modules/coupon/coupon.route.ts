import express, { Router } from 'express'
import { UserRole } from '@prisma/client'
import { validateSchema } from '../../middleware/validateRequest.js'
import { CouponValidation } from './coupon.validation.js'
import { CouponController } from './coupon.controller.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { authenticate } from '../../middleware/authinticate.js'

const router: Router = express.Router()

router.get('/public-details/:code', CouponController.getPublicCouponDetails)

router.use(authenticate)

router.post(
  '/',
  authorizeRoles(UserRole.ADMIN),
  validateSchema(CouponValidation.createCoupon),
  CouponController.createCoupon
)

router.get('/', authorizeRoles(UserRole.ADMIN), CouponController.getAllCoupons)

router.get('/:couponId', authorizeRoles(UserRole.ADMIN), CouponController.getCouponById)

router.patch(
  '/:couponId',
  authorizeRoles(UserRole.ADMIN),
  validateSchema(CouponValidation.updateCoupon),
  CouponController.updateCoupon
)

router.patch(
  '/:couponId/status',
  authorizeRoles(UserRole.ADMIN),
  validateSchema(CouponValidation.updateCouponStatus),
  CouponController.updateCouponStatus
)

router.post(
  '/validate',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(CouponValidation.validateCoupon),
  CouponController.validateCoupon
)

router.patch('/:couponId/archive', authorizeRoles(UserRole.ADMIN), CouponController.archiveCoupon)
router.delete('/:couponId', authorizeRoles(UserRole.ADMIN), CouponController.deleteCoupon)

export const CouponRoutes = router
