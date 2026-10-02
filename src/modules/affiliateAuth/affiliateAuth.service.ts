import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import jwt from 'jsonwebtoken'
import { comparePassword, hashPassword } from '../../shared/utils/password.js'
import httpStatus from 'http-status'
import crypto from 'node:crypto'
import redis from '../../config/redis.config.js'
import { sendPasswordResetCodeEmail } from '../../shared/utils/email.service.js'

const loginAffiliate = async (payload: { email: string; password: string }) => {
  const affiliate = await prisma.affiliate.findUnique({
    where: { email: payload.email },
    select: { id: true, name: true, email: true, password: true, vendorId: true }
  })

  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  const isPasswordMatch = await comparePassword(payload.password, affiliate.password)
  if (!isPasswordMatch) throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid credentials')

  const accessToken = jwt.sign(
    { id: affiliate.id, email: affiliate.email, role: 'AFFILIATE', vendorId: affiliate.vendorId },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '7d' }
  )

  return { accessToken, affiliate: { id: affiliate.id, name: affiliate.name, email: affiliate.email } }
}

const forgotPassword = async (email: string) => {
  const affiliate = await prisma.affiliate.findUnique({ where: { email } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  const code = crypto.randomInt(100000, 999999).toString()
  await redis.set(`otp:affiliate:${affiliate.id}:PASSWORD_RESET`, code, 'EX', 120)

  // Send the reset code to the affiliate's email
  await sendPasswordResetCodeEmail(affiliate.email, affiliate.name, code)
}

const resetPassword = async (email: string, code: string, newPassword: string) => {
  const affiliate = await prisma.affiliate.findUnique({ where: { email } })
  if (!affiliate) throw new AppError(httpStatus.NOT_FOUND, 'Affiliate not found')

  const otpCode = await redis.get(`otp:affiliate:${affiliate.id}:PASSWORD_RESET`)
  if (!otpCode) throw new AppError(httpStatus.BAD_REQUEST, 'Reset code not found or expired')
  if (otpCode !== code) throw new AppError(httpStatus.BAD_REQUEST, 'Invalid code')

  await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { password: await hashPassword(newPassword) }
  })

  await redis.del(`otp:affiliate:${affiliate.id}:PASSWORD_RESET`)
}

export const AffiliateAuthService = {
  loginAffiliate,
  forgotPassword,
  resetPassword,
}
