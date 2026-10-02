import { UserRole } from '@prisma/client'
import express from 'express'

import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { DocumentationController } from './documentation.controller.js'
import { DocumentationValidation } from './documentation.validation.js'

const router: express.Router = express.Router()

router.post(
  '/',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateSchema(DocumentationValidation.createDocumentationSchema),
  DocumentationController.createDocumentation
)

router.get(
  '/',
  DocumentationController.getAllDocumentationsForAdmin
)

router.get(
  '/:title',

  DocumentationController.getSingleDocumentation
)

router.patch(
  '/:id',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateSchema(DocumentationValidation.updateDocumentationSchema),
  DocumentationController.updateDocumentation
)

router.delete(
  '/:id',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  DocumentationController.deleteDocumentation
)

export const DocumentationRoutes = router
