import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '../shared/errors/AppError.js'

export const authorizeRole = (...roles: string[]) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    try {
      const loginUserRole = req.user?.role

      if (!loginUserRole) {
        throw new AppError(StatusCodes.UNAUTHORIZED, 'Authentication required')
      }

      if (!roles.includes(loginUserRole)) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'You do not have permission to access this resource'
        )
      }

      // User is a valid admin, proceed to the route handler
      next()
    } catch (error) {
      next(error) // Pass DB errors to your global error handler
    }
  }
}
