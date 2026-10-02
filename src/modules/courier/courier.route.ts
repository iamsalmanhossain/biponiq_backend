import express, { Router } from 'express'
import { authenticate } from '../../middleware/authinticate.js'
import { validateQuery, validateSchema } from '../../middleware/validateRequest.js'
import { CourierController } from './courier.controller.js'
import {
  CreateOrderSchema,
  GetCourierOrdersQuerySchema,
  SaveCredentialsSchema,
} from './courier.validation.js'

const router: Router = express.Router()

// All courier management routes require authentication
router.use(authenticate)

// Manage Courier Credentials
router.post(
  '/credentials',
  validateSchema(SaveCredentialsSchema),
  CourierController.saveCredentials
)

router.get('/credentials', CourierController.getVendorCouriers)

router.get('/available', CourierController.getAvailableCouriers)

router.delete('/credentials/:provider', CourierController.deleteCredentials)

// Courier Operations
router.post(
  '/create-order',
  validateSchema(CreateOrderSchema),
  CourierController.createOrder
)

router.get('/orders', validateQuery(GetCourierOrdersQuerySchema), CourierController.getCourierOrders)

router.get('/orders/:id', CourierController.getCourierOrderById)

router.get('/orders/by-order/:orderId', CourierController.getCourierOrdersByOrderId)

router.get('/track/:provider/:consignmentId', CourierController.trackParcel)

router.get('/balance/:provider', CourierController.getBalance)

export const CourierRoutes = router

