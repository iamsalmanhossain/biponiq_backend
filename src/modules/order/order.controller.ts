import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { OrderStatus } from '@prisma/client'
import { OrderService } from './order.service.js'
import { OrderPaginationSchema } from './order.validation.js'

// ─────────────────────────────────────────────
// PLACE ORDER — No login required
// POST /api/v1/orders
// ─────────────────────────────────────────────
const placeOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Pass null for userId since no login is required
    const result = await OrderService.placeOrder(null, req.body)

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Order placed successfully',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// PLACE GUEST ORDER — No login required
// POST /api/v1/orders/guest
// Returns guestCustomerId to track the order later
// ─────────────────────────────────────────────
const placeGuestOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OrderService.placeGuestOrder(req.body)

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Guest order placed successfully',
      // guestCustomerId shown separately for easy access
      guestCustomerId: (result as any).guestCustomerId,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// TRACK GUEST ORDER — No login required
// GET /api/v1/orders/track?token=<guestCustomerId>
// ─────────────────────────────────────────────
const trackGuestOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query['token'] as string

    if (!token) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Guest token is required. Use: ?token=your_guestCustomerId',
      })
    }

    const result = await OrderService.trackGuestOrder(token)

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Orders found',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// GET ORDER RESULT — No login required
// GET /api/v1/orders/result
// Access is protected by a short-lived result token.
// ─────────────────────────────────────────────
const getOrderResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorizationHeader = req.headers.authorization

    if (!authorizationHeader?.startsWith('Bearer ')) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Order result token is required.',
        data: null,
      })
    }

    const resultToken = authorizationHeader.split(' ')[1]

    if (!resultToken) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Order result token is required.',
        data: null,
      })
    }

    const result = await OrderService.getOrderResult(resultToken)

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order result retrieved successfully',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// GET ALL ORDERS — Token required
// Role-based: admin/vendor/customer
// GET /api/v1/orders
// ─────────────────────────────────────────────
const getAllOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const role = req.user!.role ?? 'GUESTCUSTOMER'

    const parsed = OrderPaginationSchema.safeParse(req.query)
    const page = parsed.success ? parsed.data.page : 1
    const limit = parsed.success ? parsed.data.limit : 10

    const result = await OrderService.getAllOrders(userId, role, page, limit)

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Orders retrieved successfully',
      ...result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// GET MY ORDERS — Token required
// Returns logged-in user's own orders
// GET /api/v1/orders/my-orders
// ─────────────────────────────────────────────
const getMyOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userEmail = req.user!.email

    if (!userEmail) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Email not found in token. Cannot retrieve orders.',
      })
    }

    const parsed = OrderPaginationSchema.safeParse(req.query)
    const page = parsed.success ? parsed.data.page : 1
    const limit = parsed.success ? parsed.data.limit : 10

    const result = await OrderService.getMyOrders(userEmail, page, limit)

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Your orders retrieved successfully',
      ...result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// GET SINGLE ORDER — Token required
// Ownership enforced per role
// GET /api/v1/orders/:id
// ─────────────────────────────────────────────
const getSingleOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string
    const userId = req.user!.id
    const role = req.user!.role ?? 'GUESTCUSTOMER'

    const result = await OrderService.getSingleOrder(id, userId, role)

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order retrieved successfully',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// UPDATE ORDER STATUS — Token required
// Admin/Vendor only. COMPLETED triggers commission.
// PATCH /api/v1/orders/:orderId/status
// ─────────────────────────────────────────────
const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params['orderId'] as string
    const requesterId = req.user!.id
    const requesterRole = req.user!.role ?? 'GUESTCUSTOMER'
    const { status } = req.body as { status: OrderStatus }

    const result = await OrderService.updateOrderStatus(orderId, status, requesterId, requesterRole)

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order status updated successfully',
      data: result,
    })
  } catch (error: any) {
    // Return structured response for invalid status transitions
    if (error.currentStatus !== undefined) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: error.message,
        currentStatus: error.currentStatus,
        attemptedStatus: error.attemptedStatus,
        allowedTransitions: error.allowedTransitions,
      })
    }
    next(error)
  }
}

// ─────────────────────────────────────────────
// CANCEL ORDER — Token required
// Only PENDING or PROCESSING can be cancelled
// PATCH /api/v1/orders/:id/cancel
// ─────────────────────────────────────────────
// const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     const id     = req.params["id"] as string;
//     const userId = req.user!.id;
//     const role   = req.user!.role ?? "GUESTCUSTOMER";

//     const result = await OrderService.cancelOrder(id, userId, role);

//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: "Order cancelled successfully",
//       data: result,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// ─────────────────────────────────────────────
// APPLY COUPON
// POST /api/v1/orders/apply-coupon
// ─────────────────────────────────────────────
const applyCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OrderService.applyCoupon(req.body)
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Coupon applied successfully',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

export const OrderController = {
  placeOrder,
  placeGuestOrder,
  trackGuestOrder,
  applyCoupon,
  getAllOrders,
  getMyOrders,
  getSingleOrder,
  updateOrderStatus,
  getOrderResult,
  // cancelOrder,
}
