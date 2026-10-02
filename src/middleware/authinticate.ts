import { Request, Response, NextFunction } from 'express'
import AppError from '../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'

import jwt from 'jsonwebtoken'
import { CustomJwtPayload } from '../shared/interfaces/CustomJwtPayload.js'
import { env } from '../config/env.js'
import catchAsync from '../shared/utils/catchAsync.js'

export const authenticate = catchAsync(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization
    const headerToken = authHeader && authHeader.split(' ')[1]
    const cookieToken = req.cookies.accessToken
    const queryToken = req.query.token as string

    // Prefer header token over cookie to allow multiple sessions (e.g. Vendor + Affiliate) on same browser
    const token = headerToken || cookieToken || queryToken

    if (!token) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'token not provided')
    }
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as CustomJwtPayload
    if (!payload) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'unauthorized user')
    }
    req.user = payload
    next()
  }
)
