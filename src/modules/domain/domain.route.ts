import { UserRole } from '@prisma/client'
import { Router } from 'express'

import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { validateSchema } from '../../middleware/validateRequest.js'

import { DomainAvailabilityController } from './availability/domainAvailability.controller.js'
import { domainAvailabilityRateLimit } from './availability/domainAvailability.rateLimit.js'
import { DomainAvailabilityValidation } from './availability/domainAvailability.validation.js'

import { DomainQuoteController } from './quote/domainQuote.controller.js'
import { domainQuoteRateLimit } from './quote/domainQuote.rateLimit.js'
import { DomainQuoteValidation } from './quote/domainQuote.validation.js'

import { DomainRegistrantController } from './registrant/domainRegistrant.controller.js'
import {
  confirmVendorDomainRegistrantSchema,
  saveVendorDomainRegistrantSchema,
} from './registrant/domainRegistrant.validation.js'
import { PurchasedDomainDashboardController } from './dashboard/purchasedDomainDashboard.controller.js'

const router: Router = Router()

router.use(authenticate)

router.get(
  '/dashboard/managed-purchased-domain',
  authorizeRoles(UserRole.VENDOR),
  PurchasedDomainDashboardController.getManagedPurchasedDomain
)

router.post(
  '/availability',
  authorizeRoles(UserRole.VENDOR),
  domainAvailabilityRateLimit,
  validateSchema(DomainAvailabilityValidation.checkDomainAvailabilitySchema),
  DomainAvailabilityController.checkDomainAvailability
)

router.post(
  '/quote',
  authorizeRoles(UserRole.VENDOR),
  domainQuoteRateLimit,
  validateSchema(DomainQuoteValidation.getDomainQuoteSchema),
  DomainQuoteController.getDomainQuote
)

router.get(
  '/registrant',
  authorizeRoles(UserRole.VENDOR),
  DomainRegistrantController.getMyDomainRegistrant
)

router.put(
  '/registrant',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(saveVendorDomainRegistrantSchema),
  DomainRegistrantController.saveMyDomainRegistrant
)

router.post(
  '/registrant/confirm',
  authorizeRoles(UserRole.VENDOR),
  validateSchema(confirmVendorDomainRegistrantSchema),
  DomainRegistrantController.confirmMyDomainRegistrant
)

export const DomainRoutes = router
