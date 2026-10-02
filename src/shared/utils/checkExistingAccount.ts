import { StatusCodes } from 'http-status-codes'
import AppError from '../errors/AppError.js'
import { prisma } from '../../lib/prisma.js'

export const checkExistingAccount = async (role: 'vendor' | 'admin', userId: string) => {
  // existingAccount = role === vendor? vendor.findUnique : admin:findUnique
  const existingAccount =
    role === 'vendor'
      ? await prisma.vendor.findUnique({
          where: {
            userId,
          },
          select: {
            id: true,
          },
        })
      : await prisma.admin.findUnique({
          where: {
            userId,
          },
          select: {
            id: true,
          },
        })

  if (!existingAccount) throw new AppError(StatusCodes.NOT_FOUND, 'User account not found!')
  return existingAccount
}
