import { Router } from 'express'
import { AffiliateAuthController } from './affiliateAuth.controller.js'
import { affiliateLoginSchema, forgotPasswordSchema, resetPasswordSchema } from './affiliateAuth.schema.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { authRateLimit } from '../../middleware/rateLimit.js'

const router: Router = Router()

router.use(authRateLimit)

router.post('/login', validateSchema(affiliateLoginSchema), AffiliateAuthController.loginAffiliate)
router.post('/forgot-password', validateSchema(forgotPasswordSchema), AffiliateAuthController.forgotPassword)
router.post('/reset-password', validateSchema(resetPasswordSchema), AffiliateAuthController.resetPassword)

export const AffiliateAuthRoutes = router
