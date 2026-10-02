import express, { Router } from 'express'
import { validateSchema } from '../../middleware/validateRequest.js'
import { createImageValidationSchema } from './upload.validation.js'
import { uploadController } from './upload.controller.js'
import upload from './multer.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRole } from '../../middleware/rbac.middleware.js'
import { UserRole } from '@prisma/client'

const router: Router = express.Router()

// get all images
router.get('/', uploadController.getAllImages)

// get product related all images
router.get('/related-images/:id', uploadController.getProductRelatedImages)

// get single images
router.get('/:id', uploadController.getSingleImage)

// upload admin avatar (registration)
router.post('/admin-avatar', upload.single('avatar'), uploadController.uploadAdminAvatar)

// upload vendor avatar and shopLogo (registration)
router.post(
  '/vendor-images',
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'shopLogo', maxCount: 1 },
  ]),
  uploadController.uploadVendorImages
)

router.use(authenticate)

// Max 5 uploads at a time
router.post(
  '/product-images',
  upload.array('images', 5),
  authorizeRole(UserRole.VENDOR, UserRole.ADMIN),
  validateSchema(createImageValidationSchema),

  uploadController.uploadImage
)

// Upload general image
router.post(
  '/general',
  upload.single('image'),
  authorizeRole(UserRole.VENDOR, UserRole.ADMIN),
  uploadController.uploadGeneralImage
)

// update/replace image
router.patch(
  '/:id/replace',
  upload.single('image'),
  authorizeRole(UserRole.VENDOR),
  uploadController.replaceImage
)

// delete image
router.delete(
  '/delete/:id',
  authorizeRole(UserRole.VENDOR, UserRole.ADMIN),
  uploadController.deleteImage
)

// common image upload api
// Max 10 uploads at a time
router.post(
  '/upload-extra-images',
  upload.array('images', 10),
  authorizeRole(UserRole.VENDOR, UserRole.ADMIN),
  validateSchema(createImageValidationSchema),
  uploadController.commonImageUploader
)

export const UploadRoutes = router
