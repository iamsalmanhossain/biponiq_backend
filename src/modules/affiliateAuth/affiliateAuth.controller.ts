import { Request, Response } from 'express'
import catchAsync from '../../shared/utils/catchAsync.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import { AffiliateAuthService } from './affiliateAuth.service.js'
import { env } from '../../config/env.js'
import httpStatus from 'http-status'

const loginAffiliate = catchAsync(async (req: Request, res: Response) => {
  const result = await AffiliateAuthService.loginAffiliate(req.body)

  res.cookie('accessToken', result.accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })

  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Login successful', data: result })
})


const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await AffiliateAuthService.forgotPassword(req.body.email)
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Password reset email sent successfully', data: null })
})

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body
  await AffiliateAuthService.resetPassword(email, code, newPassword)
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Password reset successfully', data: null })
})

export const AffiliateAuthController = {
  loginAffiliate,
  forgotPassword,
  resetPassword,
}
