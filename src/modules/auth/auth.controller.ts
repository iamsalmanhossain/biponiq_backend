import type { Request, Response } from 'express'
import { AuthService } from './auth.service.js'
import catchAsync from '../../shared/utils/catchAsync.js'
import { env } from '../../config/env.js'
import { UserRole } from '@prisma/client'
import AppError from '../../shared/errors/AppError.js'
import { prisma } from '../../lib/prisma.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import httpStatus from 'http-status'
import redis from '../../config/redis.config.js'
import jwt from 'jsonwebtoken'

const registerVendor = catchAsync(async (req, res) => {
  await AuthService.registerUser(req.body, UserRole.VENDOR)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vendor Registration Successful',
  })
})

const registerAdmin = catchAsync(async (req, res) => {
  try {
    await AuthService.registerUser(req.body, UserRole.ADMIN)

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Admin Registration Successful',
    })
  } catch (err) {
    console.error(err)
    throw err
  }
})

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const device_token = (req.headers['x-device-token'] as string) || req.body.device_token
  const payload = { ...req.body, device_token }
  const result = await AuthService.loginUser(payload)

  res.cookie('accessToken', result.accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })

  const responseData: any = {
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    phone: result.user.phone,
    vendorCode: result.user.vendorCode,
    isVerified: result.user.isVerified,
    avatar: result.user.avatar,
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  }

  if (result.newDeviceToken) {
    responseData.device_token = result.newDeviceToken
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Login Successfully',
    data: responseData,
  })
})

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { email, code } = req.body

  await AuthService.verifyEmail(email, code)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Email verified successfully',
  })
})

const socialLogin = catchAsync(async (req: Request, res: Response) => {
  const { token, provider } = req.body

  if (!token || !provider) {
    throw new AppError(400, 'Token and provider are required')
  }

  const result = await AuthService.socialLogin({ token, provider })

  // আপনার প্রজেক্টের কাস্টম কুকি সেট লজিক
  res.cookie('accessToken', result.accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Login Successfully',
    data: result.user,
  })
})

const resendVerificationCode = catchAsync(async (req, res) => {
  const { email, type } = req.body
  await AuthService.resendVerificationCode(email, type)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code resent successfully',
  })
})

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken
  const result = await AuthService.refreshToken(token)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Token refreshed successfully',
    data: result,
  })
})

const logoutUser = catchAsync(async (req: Request, res: Response) => {
  let token: string | null = null
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1] || null
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken
  }

  if (token) {
    const decoded = jwt.decode(token) as any
    if (decoded && decoded.exp) {
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000)
      if (expiresIn > 0) {
        await redis.set(`blacklist:${token}`, 'true', 'EX', expiresIn)
      }
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  })

  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  })

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logout successful',
  })
})

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body

  await AuthService.forgotPassword(email)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password reset email send successfully',
  })
})

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body

  await AuthService.resetPassword(email, code, newPassword)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password reset successfully',
  })
})

const getShopSettings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id // আপনার auth middleware থেকে আসা লগইন করা ইউজারের ID

  if (!userId) {
    throw new AppError(401, 'Unauthorized access. Please login first.')
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    include: {
      address: true, // ভেন্ডরের অ্যাড্রেস রিলেশন ডেটা সহ নিয়ে আসা[cite: 6]
    },
  })

  if (!vendor) {
    throw new AppError(404, 'Vendor shop configurations not found.')
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Shop settings fetched successfully',
    data: vendor,
  })
})

const updateShopSettings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id
  const { shopName, subDomain, shopAddress, shopLogo, pageConfig } = req.body

  if (!userId) {
    throw new AppError(401, 'Unauthorized access.')
  }

  const currentVendor = await prisma.vendor.findUnique({
    where: { userId },
  })

  if (!currentVendor) {
    throw new AppError(404, 'Vendor profile not found.')
  }

  // সাবডোমেইন পরিবর্তন হলে ইউনিকনেস ও URL ফরম্যাট স্যানিটাইজ চেক করা
  let formattedSubDomain = currentVendor.subDomain
  if (subDomain && subDomain !== currentVendor.subDomain) {
    formattedSubDomain = subDomain.toLowerCase().replace(/\s+/g, '')

    const subDomainExists = await prisma.vendor.findUnique({
      where: { subDomain: formattedSubDomain },
    })

    if (subDomainExists) {
      throw new AppError(400, 'This Shop URL/Subdomain is already taken by another shop.')
    }
  }

  // Transaction-এর মাধ্যমে ডাটাবেজে একযোগে ভেন্ডর ও অ্যাড্রেস আপডেট সম্পন্ন করা[cite: 6]
  const updatedVendor = await prisma.$transaction(async (tx) => {
    if (shopAddress !== undefined) {
      await tx.address.update({
        where: { id: currentVendor.addressId },
        data: {
          area: shopAddress,
        },
      })
    }

    return await tx.vendor.update({
      where: { userId },
      data: {
        shopName: shopName || undefined,
        subDomain: formattedSubDomain,
        shopLogo: shopLogo !== undefined ? shopLogo : undefined,
        pageConfig: pageConfig ? pageConfig : undefined,
      },
      include: {
        address: true,
      },
    })
  })

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Shop configurations updated successfully.',
    data: updatedVendor,
  })
})

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id // আপনার verifyToken middleware থেকে আসা লগইন করা ইউজারের ID

  if (!userId) {
    throw new AppError(401, 'Unauthorized access. Please login first.')
  }

  const { name, avatar, address } = req.body

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new AppError(404, 'User not found')
  }

  // ডাটাবেজে ইউজারের নাম এবং অ্যাভাটার আপডেট করা হচ্ছে
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(avatar !== undefined ? { avatar } : undefined),
    },
  })

  let updatedAddress = null

  if (user.role === 'VENDOR') {
    if (address !== undefined) {
      const vendor = await prisma.vendor.findUnique({
        where: { userId },
        select: { addressId: true },
      })
      if (vendor?.addressId) {
        const addr = await prisma.address.update({
          where: { id: vendor.addressId },
          data: { area: address },
        })
        updatedAddress = addr.area
      }
    } else {
      const vendor = await prisma.vendor.findUnique({
        where: { userId },
        include: { address: true },
      })
      updatedAddress = vendor?.address?.area || null
    }
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile updated successfully.',
    data: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      avatar: updatedUser.avatar,
      address: updatedAddress,
    },
  })
})

const googleAuth = catchAsync(async (req: Request, res: Response) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email profile',
  })
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  res.redirect(url)
})

const googleAuthCallback = catchAsync(async (req: Request, res: Response) => {
  const { code } = req.query
  if (!code) {
    throw new AppError(400, 'Authorization code not provided')
  }

  const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`
  const result = await AuthService.handleGoogleAuthCallback(code as string, redirectUri)

  // Redirect to frontend with token in URL (frontend will save it and redirect)
  const frontendCallbackUrl = `${env.CLIENT_URL}/auth/social-callback?token=${result.accessToken}`
  res.redirect(frontendCallbackUrl)
})

const completeVendorOnboarding = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.completeVendorOnboarding(req.user.id, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  })
})

const checkSubdomainAvailability = catchAsync(async (req: Request, res: Response) => {
  const { subDomain } = req.query
  const excludeUserId = req.user?.id // Optional: if verified token is present

  if (!subDomain) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Subdomain is required')
  }

  const result = await AuthService.checkSubdomainAvailability(subDomain as string, excludeUserId)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.isAvailable ? 'Subdomain is available' : 'Subdomain is taken',
    data: result,
  })
})

const checkPhoneAvailability = catchAsync(async (req: Request, res: Response) => {
  const { phone } = req.query
  const excludeUserId = req.user?.id // Optional

  if (!phone) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Phone number is required')
  }

  const result = await AuthService.checkPhoneAvailability(phone as string, excludeUserId)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.isAvailable ? 'Phone number is available' : 'Phone number is already taken',
    data: result,
  })
})

export const AuthController = {
  registerVendor,
  registerAdmin,
  loginUser,
  socialLogin,
  verifyEmail,
  logoutUser,
  refreshToken,
  forgotPassword,
  resetPassword,
  resendVerificationCode,
  getShopSettings,
  updateShopSettings,
  updateProfile,
  googleAuth,
  googleAuthCallback,
  completeVendorOnboarding,
  checkSubdomainAvailability,
  checkPhoneAvailability,
}
