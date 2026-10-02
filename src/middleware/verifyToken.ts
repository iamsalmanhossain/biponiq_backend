import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { CustomJwtPayload } from '../shared/interfaces/CustomJwtPayload.js'
import { env } from './../config/env.js'

import { StatusCodes } from 'http-status-codes'
import { sendResponse } from '../shared/utils/sendResponse.js'
import AppError from '../shared/errors/AppError.js'
import redis from '../config/redis.config.js'

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | null = null

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1] || null
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken
    }

    if (!token) {
      return sendResponse(res, {
        statusCode: StatusCodes.UNAUTHORIZED,
        success: false,
        message: 'Access denied. No token provided.',
        data: null,
      })
    }

    const jwtSecret = env.JWT_ACCESS_SECRET
    if (!jwtSecret) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid User!!')
    }

    
    const isBlacklisted = await redis.get(`blacklist:${token}`)
    if (isBlacklisted) {
      return sendResponse(res, {
        statusCode: StatusCodes.UNAUTHORIZED,
        success: false,
        message: 'Token has been blacklisted (Logged out).',
        data: null,
      })
    }

    const decoded = jwt.verify(token, jwtSecret) as CustomJwtPayload

    req.user = decoded

    next()
  } catch (error) {
    return sendResponse(res, {
      statusCode: StatusCodes.UNAUTHORIZED,
      success: false,
      message: 'Invalid token.',
      data: error,
    })
  }
}
