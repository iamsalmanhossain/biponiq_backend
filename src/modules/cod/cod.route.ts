import express, { type Router } from 'express'

import { createCODOrderValidationSchema } from './cod.validation.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { CodController } from './cod.controller.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'

const router: Router = express.Router()

router.post('/place', validateSchema(createCODOrderValidationSchema), CodController.placeCODOrder)

router.patch('/:id/processing', authenticate, authorizeRoles(UserRole.VENDOR), CodController.updateToProcessing)

router.patch('/:id/shipped', authenticate, authorizeRoles(UserRole.VENDOR), CodController.updateToShipped)

export const CodRoutes = router
