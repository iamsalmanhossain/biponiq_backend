import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { StatusCodes } from 'http-status-codes'
import { sendResponse } from '../shared/utils/sendResponse.js'

// Secret for guest order tokens (reuses the access secret, or you could use a separate one)
const GUEST_ORDER_SECRET = env.JWT_ACCESS_SECRET + '_guest_order'

export const generateGuestOrderToken = (orderId: string): string => {
  return jwt.sign(
    { orderId, type: 'guest_order' },
    GUEST_ORDER_SECRET,
    { expiresIn: '2h' }
  )
}

export const verifyGuestOrderToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | null = null

    // Accept from Authorization header: "Bearer <token>"
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1] || null
    }
    // Or from x-guest-order-token header
    if (!token && req.headers['x-guest-order-token']) {
      token = req.headers['x-guest-order-token'] as string
    }

    if (!token) {
      return sendResponse(res, {
        statusCode: StatusCodes.UNAUTHORIZED,
        success: false,
        message: 'Guest order token required.',
        data: null,
      })
    }

    const decoded = jwt.verify(token, GUEST_ORDER_SECRET) as { orderId: string; type: string }

    if (decoded.type !== 'guest_order') {
      return sendResponse(res, {
        statusCode: StatusCodes.UNAUTHORIZED,
        success: false,
        message: 'Invalid token type.',
        data: null,
      })
    }

    // Attach orderId to request for use in the controller
    ;(req as any).guestOrderId = decoded.orderId

    next()
  } catch (error) {
    return sendResponse(res, {
      statusCode: StatusCodes.UNAUTHORIZED,
      success: false,
      message: 'Invalid or expired guest order token.',
      data: null,
    })
  }
}
