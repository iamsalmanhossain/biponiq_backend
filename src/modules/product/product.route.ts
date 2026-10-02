import { Router } from 'express'
import { ProductController } from './product.controller.js'
import { authorizeRole } from '../../middleware/rbac.middleware.js'
import { UserRole } from '@prisma/client'
import { authenticate } from '../../middleware/authinticate.js'
import { verifyVendorOwnership } from '../../middleware/ownership.middleware.js'

const router = Router()

//public routes
router.get(
  '/public', ProductController.getPublicProducts
)

router.get(
  '/product/:id', ProductController.getProduct
)

router.use(authenticate)

//admin routes
router.get(
  '/admin/products', 
  authorizeRole(UserRole.ADMIN), 
  ProductController.getProductsByAdmin
)

router.patch(
  '/admin/products/:id/restore',
  authorizeRole(UserRole.ADMIN),
  ProductController.restoreProductByAdmin
)

//vendor routes
router.get(
  '/vendor/products',
  authorizeRole(UserRole.VENDOR),
  ProductController.getVendorProducts
)

router.post(
  '/vendor/products', 
  authorizeRole(UserRole.VENDOR), 
  ProductController.createProduct
)

router.patch(
  '/vendor/products/:id',
  authorizeRole(UserRole.VENDOR),
  verifyVendorOwnership(),
  ProductController.updateProduct
)

//delete
router.delete(
  '/:id',
  authorizeRole(UserRole.VENDOR, UserRole.ADMIN),
  verifyVendorOwnership(),
  ProductController.deleteProduct
)

export const ProductRoutes: Router = router