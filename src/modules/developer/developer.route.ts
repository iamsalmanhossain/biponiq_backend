import express, { Router } from 'express'
import { DeveloperController } from './developer.controller.js'
import { DeveloperValidation } from './developer.validation.js'
import { validateSchema, validateParams, } from '../../middleware/validateRequest.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'
import upload from '../upload/multer.js'

const router: Router = express.Router()

// Public routes
// Must be registered before parameterized routes to avoid conflicts
router.get('/public/developers', DeveloperController.getAllDevelopers)
router.get('/public/developer-pages', DeveloperController.getPublicDeveloperPages)
router.get(
  '/public/developer-pages/:slug',
  validateParams(DeveloperValidation.pageSlugParamSchema),
  DeveloperController.getDevelopersByPageSlug
)

router.use(authenticate)

// Admin Developer Page routes
router.post(
  '/developer-pages',
  authorizeRoles(UserRole.ADMIN),
  validateSchema(DeveloperValidation.createPageSchema),
  DeveloperController.createDeveloperPage
)

router.get(
  '/developer-pages',
  authorizeRoles(UserRole.ADMIN),
  DeveloperController.getDeveloperPagesForAdmin
)

router.get(
  '/developer-pages/:pageId',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.pageIdParamSchema),
  DeveloperController.getDeveloperPageById
)

router.patch(
  '/developer-pages/:pageId',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.pageIdParamSchema),
  validateSchema(DeveloperValidation.updatePageSchema),
  DeveloperController.updateDeveloperPage
)

router.delete(
  '/developer-pages/:pageId',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.pageIdParamSchema),
  DeveloperController.deleteDeveloperPage
)

// Admin Developer routes
router.post(
  '/developers',
  authorizeRoles(UserRole.ADMIN),
  validateSchema(DeveloperValidation.createDeveloperSchema),
  DeveloperController.createDeveloper
)

router.get(
  '/developers',
  authorizeRoles(UserRole.ADMIN),
  DeveloperController.getDevelopersForAdmin
)

router.get(
  '/developers/:developerId',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.developerIdParamSchema),
  DeveloperController.getDeveloperById
)

router.patch(
  '/developers/:developerId',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.developerIdParamSchema),
  validateSchema(DeveloperValidation.updateDeveloperSchema),
  DeveloperController.updateDeveloper
)

router.delete(
  '/developers/:developerId',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.developerIdParamSchema),
  DeveloperController.deleteDeveloper
)

// Admin Developer Image routes
router.patch(
  '/developers/:developerId/image',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.developerIdParamSchema),
  upload.single('image'),
  DeveloperController.updateDeveloperImage
)

router.delete(
  '/developers/:developerId/image',
  authorizeRoles(UserRole.ADMIN),
  validateParams(DeveloperValidation.developerIdParamSchema),
  DeveloperController.removeDeveloperImage
)

export const DeveloperRoutes = router
