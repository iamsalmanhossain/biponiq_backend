import { Router } from 'express'
import { AuthController } from './auth.controller.js'
import { authRateLimit } from '../../middleware/rateLimit.js'
import {
  forgotPasswordSchema,
  loginSchema,
  registerAdminSchema,
  registerVendorSchema,
  resetPasswordSchema,
} from './auth.zod.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { verifyToken } from '../../middleware/verifyToken.js'

const router: Router = Router()

router.use(authRateLimit)

// Admin registration
router.post('/admin/register', validateSchema(registerAdminSchema), AuthController.registerAdmin)

// vendor registration
router.post('/vendor/register', validateSchema(registerVendorSchema), AuthController.registerVendor)
router.post('/vendor/complete-onboarding', verifyToken, AuthController.completeVendorOnboarding)

// Common
router.get('/check-subdomain', verifyToken, AuthController.checkSubdomainAvailability)
router.get('/check-phone', verifyToken, AuthController.checkPhoneAvailability)
router.post('/login', validateSchema(loginSchema), AuthController.loginUser)
router.post('/social-login', AuthController.socialLogin)
router.post('/verify-email', AuthController.verifyEmail)
router.post('/resend-code', AuthController.resendVerificationCode)
router.post('/refresh-token', AuthController.refreshToken)
router.put('/update-profile', verifyToken, AuthController.updateProfile)
router.post('/logout', AuthController.logoutUser)
router.post('/forgot-password', validateSchema(forgotPasswordSchema), AuthController.forgotPassword)
router.post('/reset-password', validateSchema(resetPasswordSchema), AuthController.resetPassword)

// Social Login
router.get('/google', AuthController.googleAuth)
router.get('/google/callback', AuthController.googleAuthCallback)

router.get('/shop/settings', verifyToken, AuthController.getShopSettings);
router.put('/shop/update', verifyToken, AuthController.updateShopSettings);

export const AuthRoutes = router
