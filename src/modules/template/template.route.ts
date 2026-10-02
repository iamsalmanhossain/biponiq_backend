import express from 'express'
import { TemplateController } from './template.controller.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'

const router: express.Router = express.Router()

// Public route to get all templates (vendors will filter inactive ones or use tags)
router.get('/', TemplateController.getAllTemplates)

// Admin routes
router.get('/admin', authenticate, authorizeRoles(UserRole.ADMIN), TemplateController.getAllTemplates)
router.post('/:templateId', authenticate, authorizeRoles(UserRole.ADMIN), TemplateController.upsertTemplate)
router.patch('/:id/status', authenticate, authorizeRoles(UserRole.ADMIN), TemplateController.updateTemplateStatus)
router.patch('/:id/tags', authenticate, authorizeRoles(UserRole.ADMIN), TemplateController.updateTemplateTags)

export const TemplateRoutes = router
