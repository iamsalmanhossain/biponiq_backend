import express, { Router } from 'express'
import { VendorController } from './vendor.controller.js'
import { VendorUpdateSchema } from './vendor.validation.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { authenticate } from '../../middleware/authinticate.js'
import { detectVendor } from '../../middleware/detectVendor.js'
import cors from 'cors'
import upload from '../upload/multer.js'

const router: Router = express.Router()

// public vendor profile
router.get(
  '/public-profile/:subDomain',
  cors(),
  detectVendor,
  VendorController.getPublicVendorProfile
)

// get own vendor profile
router.get('/get-vendor-profile', authenticate, VendorController.getMyVendorProfile)

// update vendor profile
router.patch(
  '/update-vendor-profile',
  authenticate,
  validateSchema(VendorUpdateSchema),
  VendorController.updateVendorProfile
)
// delete vendor profile
router.delete('/delete-vendor-profile', authenticate, VendorController.deleteVendor)

// upload shop logo
router.patch(
  '/upload-shop-logo',
  authenticate,
  upload.single('shopLogo'),
  VendorController.uploadShopLogo
)

// delete shop logo
router.delete('/shop-logo', authenticate, VendorController.deleteShopLogo)

export const VendorRoutes = router
