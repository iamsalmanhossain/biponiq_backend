import { Request, Response, NextFunction } from 'express'
import AppError from '../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'
import { prisma } from '../lib/prisma.js'
import { UserRole } from '@prisma/client'

export const verifyVendorOwnership = () => {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.user
      const { id: productId } = req.params

      if (!user) {
        throw new AppError(
          StatusCodes.UNAUTHORIZED,
          'Authentication required'
        )
      }

      if (user.role === UserRole.ADMIN) {
        return next()
      }

      const vendor = await prisma.vendor.findUnique({
        where: {
          userId: user?.id,
        },
        select: {
          id: true,
        },
      })

      if (!vendor) {
        throw new AppError(StatusCodes.NOT_FOUND, 'Vendor profile not found.')
      }

      const product = await prisma.product.findUnique({
        where: {
          id: productId as string,
        },
        select: {
          id: true,
          vendorId: true,
        },
      })

      if (!product) {
        throw new AppError(StatusCodes.NOT_FOUND, 'Product not found.')
      }

      if (product.vendorId !== vendor.id) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'You do not have permission to access this product'
        )
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

export const verifyVendorCashoutOwnership = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user
      const { vendorId } = req.params

      if (!user) {
        throw new AppError(StatusCodes.UNAUTHORIZED, 'Unauthorized user')
      }

      if (user.role === UserRole.ADMIN) {
        return next()
      }

      const vendor = await prisma.vendor.findUnique({
        where: {
          userId: user.id,
        },
        select: {
          id: true,
        },
      })

      if (!vendor) {
        throw new AppError(StatusCodes.NOT_FOUND, 'Vendor profile not found')
      }

      if (vendor.id !== vendorId) {
        throw new AppError(StatusCodes.FORBIDDEN, 'Access denied')
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}
