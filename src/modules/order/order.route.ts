import express from 'express'
import { OrderController } from './order.controller.js'
import { validateSchema } from '../../middleware/validateRequest.js'
import { GuestOrderSchema, PlaceOrderSchema, UpdateOrderStatusSchema, ApplyCouponSchema } from './order.validation.js'
import { verifyToken } from '../../middleware/verifyToken.js'
import { authorizeRoles } from '../../middleware/authorizeRoles.js'
import { UserRole } from '@prisma/client'

const router = express.Router()

// ─────────────────────────────────────────────────────
// PUBLIC ROUTES — No token required
// ─────────────────────────────────────────────────────

// Place a guest order (no login needed)
// POST /api/v1/orders/guest
router.post('/guest', validateSchema(GuestOrderSchema), OrderController.placeGuestOrder)

// Track a guest order by guestCustomerId
// GET /api/v1/orders/track?token=<guestCustomerId>
router.get('/track', OrderController.trackGuestOrder)

// Apply a coupon to the cart
// POST /api/v1/orders/apply-coupon
router.post('/apply-coupon', validateSchema(ApplyCouponSchema), OrderController.applyCoupon)

// Place an order without login (same as guest order flow)
// POST /api/v1/orders
router.post('/', validateSchema(PlaceOrderSchema), OrderController.placeOrder)

// Get secure order result by result token
// GET /api/v1/orders/result
router.get('/result', OrderController.getOrderResult)


// ─────────────────────────────────────────────────────
// PROTECTED ROUTES — Full login token required
// ─────────────────────────────────────────────────────
router.use(verifyToken)

// Get current user's own orders (with pagination)
// GET /api/v1/orders/my-orders
router.get('/my-orders', OrderController.getMyOrders)

// Get all orders — ADMIN and VENDOR only
// GET /api/v1/orders
router.get('/', authorizeRoles(UserRole.ADMIN, UserRole.VENDOR), OrderController.getAllOrders)

// Get a single order by ID (ownership enforced)
// GET /api/v1/orders/:id
router.get('/:id', OrderController.getSingleOrder)

// Update order status (admin/vendor only)
// PATCH /api/v1/orders/:orderId/status
router.patch(
  '/:orderId/status',
  validateSchema(UpdateOrderStatusSchema),
  OrderController.updateOrderStatus
)

export const OrderRoutes: express.Router = router
