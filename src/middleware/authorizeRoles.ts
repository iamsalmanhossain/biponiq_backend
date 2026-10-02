import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '../shared/errors/AppError.js'

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role

    if (!userRole) {
      return next(new AppError(StatusCodes.UNAUTHORIZED, 'Access denied. Not authenticated.'))
    }


    if (!allowedRoles.includes(userRole)) {
      return next(
        new AppError(
          StatusCodes.FORBIDDEN,
          `Access denied. Only ${allowedRoles.join(' or ')} can perform this action. You are: ${userRole}`
        )
      )
    }

    next()
  }
}
