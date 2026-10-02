import httpStatus from 'http-status'
import AppError from '../../shared/errors/AppError.js'
import { prisma } from '../../lib/prisma.js'

export const getVendorId = async (userId: string) => {
  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized user')
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor profile not found')
  }

  return vendor.id
}
