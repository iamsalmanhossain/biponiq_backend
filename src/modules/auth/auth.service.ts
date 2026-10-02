/* eslint-disable prefer-const */
/* eslint-disable no-extra-boolean-cast */
import crypto from 'node:crypto'
import { format } from 'date-fns'
import { AdminAccountStatus, UserRole, VendorAccountStatus, VerificationType } from '@prisma/client'
import { env } from '../../config/env.js'
import axios from 'axios'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { CustomJwtPayload } from '../../shared/interfaces/CustomJwtPayload.js'
import {
  sendLoginAlertEmail,
  sendPasswordResetCodeEmail,
  sendVerificationEmail,
} from '../../shared/utils/email.service.js'
import { comparePassword, hashPassword } from '../../shared/utils/password.js'
import { LoginUser, RegisterAdmin, RegisterVendor } from './auth.zod.js'
import jwt from 'jsonwebtoken'
import { createTrialForVendor } from '../subscription/subscription.service.js'
import { addDomainToCoolify } from '../../shared/utils/coolify.service.js'
import { GooglePayload } from '../../types/auth.js'
import { OAuth2Client } from 'google-auth-library'
import redis from '../../config/redis.config.js'
import { customAlphabet } from 'nanoid'

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID)
const generateNanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8)

const userSelectFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isVerified: true,
  avatar: true,
  vendor: {
    select: {
      id: true,
      avatar: true,
      shopName: true,
      subDomain: true,
      shopLogo: true,
      accountStatus: true,
      isOnboardingComplete: true,

      vendorCode: true,
      address: {
        select: {
          area: true,
        },
      },
    },
  },
  admin: {
    select: {
      adminAccountStatus: true,
      avatar: true,
    },
  },
} as const

const userSelectWithPassword = {
  ...userSelectFields,
  password: true,
} as const

const getJwtPayload = (user: any, fallbackAvatar?: string) => {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    avatar: user.avatar || user.vendor?.avatar || user.admin?.avatar || fallbackAvatar || null,
    address: user.vendor?.address?.area || null,
  }
}

const generateAccessToken = (user: any, fallbackAvatar?: string) => {
  return jwt.sign(getJwtPayload(user, fallbackAvatar), env.JWT_ACCESS_SECRET, { expiresIn: '7d' })
}

const generateRefreshToken = (user: any) => {
  return jwt.sign({ id: user.id }, env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
}

const validateUserStatus = (user: any, checkVerification = false) => {
  if (
    checkVerification &&
    (user.role === UserRole.VENDOR || user.role === UserRole.ADMIN) &&
    !user.isVerified
  ) {
    throw new AppError(403, 'Please verify your email first')
  }

  if (user.role === UserRole.VENDOR && user.vendor?.accountStatus !== VendorAccountStatus.ACTIVE) {
    throw new AppError(403, 'Your account is not active yet. Please wait for approval.')
  }

  if (
    user.role === UserRole.ADMIN &&
    user.admin?.adminAccountStatus !== AdminAccountStatus.ACTIVE
  ) {
    throw new AppError(403, 'Your account is not active yet. Please wait for approval.')
  }
}

const registerUser = async (payload: RegisterAdmin | RegisterVendor, role: UserRole) => {
  // 1. Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: payload.email }, { phone: payload.phone }],
    },
  })

  if (existingUser?.email === payload.email) {
    throw new AppError(409, 'Email already exists')
  }

  if (existingUser?.phone === payload.phone) {
    throw new AppError(409, 'Phone already exists')
  }

  let districtId: string | undefined
  let divisionId: string | undefined
  let vendorPayload: RegisterVendor | undefined

  // 2. Validate Vendor-specific details before starting transaction
  if (role === UserRole.VENDOR) {
    vendorPayload = payload as RegisterVendor

    const vendorSubDomain = await prisma.vendor.findUnique({
      where: { subDomain: vendorPayload.subDomain },
    })

    if (vendorSubDomain) {
      throw new AppError(409, 'SubDomain Already Exists!')
    }

    const district = await prisma.district.findUnique({
      where: { name: vendorPayload.districtName },
    })

    if (!district) {
      throw new AppError(400, `District "${vendorPayload.districtName}" not found.`)
    }

    const division = await prisma.division.findUnique({
      where: { name: vendorPayload.divisionName },
    })

    if (!division) {
      throw new AppError(400, `Division "${vendorPayload.divisionName}" not found.`)
    }

    districtId = district.id
    divisionId = division.id
  }

  // 3. Prepare common registration data
  const hashedPassword = await hashPassword(payload.password)
  const verificationCode = crypto.randomInt(100000, 999999).toString()
  const avatarUrl = payload.avatar ?? null
  const avatar_key = payload.avatarKey ?? null
  // 4. Pre-fetch the FREE_TRIAL plan BEFORE the transaction
  //    so we don't do nested transactions (pgbouncer doesn't support them).
  let freeTrialPlan: { id: string; durationDays: number } | null = null
  if (role === UserRole.VENDOR) {
    const trialPlan = await prisma.subscriptionPlan.findFirst({
      where: {
        type: 'FREE_TRIAL',
        isActive: true,
      },
      select: {
        id: true,
        prices: {
          where: { billingCycle: 'MONTHLY', isActive: true },
          select: { durationDays: true },
          take: 1,
        },
      },
    })
    const trialPrice = trialPlan?.prices[0]
    if (trialPlan && trialPrice) {
      freeTrialPlan = {
        id: trialPlan.id,
        durationDays: trialPrice.durationDays,
      }
    }
  }

  // 5. Run Database Transaction (user + vendor + trial subscription in ONE transaction)
  const result = await prisma.$transaction(async (tx) => {
    let vendor = null

    const user = await tx.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        password: hashedPassword,
        phone: payload.phone,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    if (role === UserRole.ADMIN) {
      await tx.admin.create({
        data: {
          user: { connect: { id: user.id } },
          avatar: avatarUrl,
          avatarKey: avatar_key,
        },
      })
    }

    if (role === UserRole.VENDOR && vendorPayload) {
      let vendorCode = ''
      let isUnique = false
      while (!isUnique) {
        vendorCode = `BPNQ-${generateNanoid()}`
        const existing = await tx.vendor.findUnique({ where: { vendorCode } })
        if (!existing) isUnique = true
      }

      vendor = await tx.vendor.create({
        data: {
          vendorCode,
          avatar: avatarUrl,
          avatarKey: avatar_key,
          shopName: vendorPayload.shopName,
          subDomain: vendorPayload.subDomain,
          shopLogo: vendorPayload.shopLogo ?? null,
          shopLogoKey: vendorPayload.shopLogoKey ?? null,
          isOnboardingComplete: true,
          user: { connect: { id: user.id } },
          deliveryCharge: { create: {} },
          address: {
            create: {
              area: vendorPayload.area,
              district: { connect: { id: districtId! } },
              division: { connect: { id: divisionId! } },
            },
          },
        },
      })



      // Create free trial subscription inside the SAME transaction.
      // This avoids FK constraint issues from pgbouncer transaction pooling.
      if (freeTrialPlan) {
        const now = new Date()
        const endDate = new Date(now)
        endDate.setDate(endDate.getDate() + freeTrialPlan.durationDays)

        await tx.vendorSubscription.create({
          data: {
            vendorId: vendor.id,
            planId: freeTrialPlan.id,
            billingCycle: 'MONTHLY',
            status: 'TRIAL',
            startDate: now,
            endDate,
            paidAt: now,
            amountPaid: 0,
          },
        })
      }
    }

    return { user, vendor }
  })

  // 6. Handle External Side-Effects (Outside DB Transaction)
  try {
    if (role === UserRole.VENDOR && result.vendor && vendorPayload) {
      if (!freeTrialPlan) {
        await createTrialForVendor(result.vendor.id)
      }
      // Coolify domain registration is non-critical — don't fail registration if it errors
      addDomainToCoolify(vendorPayload.subDomain).catch((err) => {
        console.error('[registerUser] addDomainToCoolify failed (non-fatal):', err?.message ?? err)
      })
    }

    if (role === UserRole.VENDOR) {
      await redis.set(`otp:${result.user.id}:EMAIL_VERIFY`, verificationCode, 'EX', 120)
    }
    await sendVerificationEmail(result.user.email, result.user.name, verificationCode)

    return result.user
  } catch (error) {
    // Only reach here if sendVerificationEmail (or createTrialForVendor) failed.
    // Attempt to clean up the user so re-registration is possible.
    try {
      await prisma.user.delete({ where: { id: result.user.id } })
    } catch (deleteErr) {
      console.error('[registerUser] Failed to cleanup user after side-effect error:', deleteErr)
    }
    throw error
  }
}

const verifyEmail = async (email: string, code: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  })

  if (!user) {
    throw new AppError(404, 'User not found')
  }

  const otpCode = await redis.get(`otp:${user.id}:EMAIL_VERIFY`)

  if (!otpCode) {
    throw new AppError(404, 'Verification code not found or expired')
  }

  if (otpCode !== code) {
    throw new AppError(400, 'Invalid verification code')
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      isVerified: true,
    },
  })

  await redis.del(`otp:${user.id}:EMAIL_VERIFY`)

  return true
}

const resendVerificationCode = async (email: string, type: VerificationType = 'EMAIL_VERIFY') => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  })

  if (!user) {
    throw new AppError(404, 'User not found')
  }

  if (type === 'EMAIL_VERIFY' && user.isVerified) {
    throw new AppError(400, 'Email already verified')
  }

  const newCode = crypto.randomInt(100000, 999999).toString()

  await redis.set(`otp:${user.id}:${type}`, newCode, 'EX', 120)

  if (type === 'PASSWORD_RESET') {
    await sendPasswordResetCodeEmail(user.email, user.name, newCode)
  } else {
    await sendVerificationEmail(user.email, user.name, newCode)
  }

  return null
}

const loginUser = async (payload: LoginUser) => {
  const user = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
    select: userSelectWithPassword,
  })

  if (!user) {
    throw new AppError(401, 'Invalid email or password')
  }

  const isPasswordMatched = await comparePassword(payload.password, user.password)

  if (!isPasswordMatched) {
    throw new AppError(401, 'Invalid email or password')
  }

  // Role Based Verification & Account Status
  validateUserStatus(user, true)

  let isNewDevice = true
  let newDeviceToken: string | undefined

  if (payload.device_token) {
    const existingDevice = await prisma.trustedDevice.findFirst({
      where: {
        userId: user.id,
        deviceToken: payload.device_token,
      },
    })
    if (existingDevice) {
      isNewDevice = false
    }
  }

  if (isNewDevice) {
    newDeviceToken = crypto.randomUUID()
    await prisma.trustedDevice.create({
      data: {
        userId: user.id,
        deviceToken: newDeviceToken,
      },
    })
    sendLoginAlertEmail(user.email).catch(err => console.error('Failed to send login alert:', err))
  }

  const accessToken = generateAccessToken(user)
  const refreshToken = generateRefreshToken(user)

  return {
    accessToken,
    refreshToken,
    newDeviceToken,
    user: {
      ...getJwtPayload(user),
      phone: user.phone,
      isVerified: user.isVerified,
      isOnboardingComplete: user.vendor?.isOnboardingComplete ?? null,
      shopName: user.vendor?.shopName ?? null,
      subDomain: user.vendor?.subDomain ?? null,
      vendorCode: user.vendor?.vendorCode ?? null,
      admin: {
        adminAccountStatus: user.admin?.adminAccountStatus,
        avatar: user.admin?.avatar || user.avatar || null,
      },
      accessToken,
      refreshToken,
    },
  }
}

const socialLogin = async (payload: { token: string; provider: 'GOOGLE' }) => {
  let email: string | undefined
  let name: string | undefined
  let avatar: string | undefined

  try {
    if (payload.provider === 'GOOGLE') {
      const googleRes = await axios.get(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${payload.token}`
      )

      const googleData = googleRes.data as GooglePayload
      
    

      email = googleData?.email
      name = googleData?.name
      avatar = googleData?.picture // গুগলের ইমেজ লিঙ্ক
      

    }
  } catch (error) {
    console.error("=== গুগল এপিআই কল এরর ===", error);
    throw new AppError(401, `Invalid ${payload.provider} token or authentication failed`)
  }

  if (!email) {
    throw new AppError(400, 'Email verification is required from your social account')
  }


  let dbUser = await prisma.user.findUnique({
    where: { email },
    select: userSelectWithPassword,
  })



 
  if (!dbUser) {
  
    let baseSubDomain = (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
    let subDomain = baseSubDomain
    let counter = 1
    while (await prisma.vendor.findUnique({ where: { subDomain } })) {
      subDomain = `${baseSubDomain}${counter}`
      counter++
    }

    const firstDistrict = await prisma.district.findFirst()
    const firstDivision = await prisma.division.findFirst()

    if (!firstDistrict || !firstDivision) {
      throw new AppError(
        500,
        'Database not properly seeded. Missing District/Division for auto-registration.'
      )
    }

    let vendorCode = ''
    let isUnique = false
    while (!isUnique) {
      vendorCode = `BPNQ-${generateNanoid()}`
      const existing = await prisma.vendor.findUnique({ where: { vendorCode } })
      if (!existing) isUnique = true
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        name: name || 'Social User',
        role: UserRole.VENDOR,
        isVerified: true,
        provider: payload.provider,
        password: '',
        phone: `google_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
        avatar: avatar || '',
        vendor: {
          create: {
            vendorCode,
            shopName: `${name || 'User'}'s Shop`,
            subDomain,
            avatar: avatar || null,
            accountStatus: VendorAccountStatus.ACTIVE,
            deliveryCharge: { create: {} },
            address: {
              create: {
                area: 'Auto Generated Address',
                district: { connect: { id: firstDistrict.id } },
                division: { connect: { id: firstDivision.id } },
              },
            },
          },
        },
      },
      select: userSelectFields,
    })


    try {
      if (newUser.vendor) {
        await createTrialForVendor(newUser.vendor.id)
        await addDomainToCoolify(newUser.vendor.subDomain)
      }
    } catch (error) {
      await prisma.user.delete({
        where: {
          id: newUser.id,
        },
      })

      throw error
    }

    dbUser = newUser as any
  } else {
   
    if (avatar && dbUser.avatar !== avatar) {
     
      dbUser = await prisma.user.update({
        where: { email },
        data: { avatar },
        select: userSelectWithPassword,
      }) as any
    }
  }

  const user = dbUser as any


  validateUserStatus(user)

  sendLoginAlertEmail(user.email).catch(err => console.error('Failed to send login alert:', err))

  const accessToken = generateAccessToken(user, avatar)
  const refreshToken = generateRefreshToken(user)



  return {
    accessToken,
    refreshToken,
    user: {
      ...getJwtPayload(user, avatar),
      phone: user.phone,
      isVerified: user.isVerified,
      admin: {
        adminAccountStatus: user.admin?.adminAccountStatus || null,
        avatar: user.admin?.avatar || user.avatar || null,
      },
      accessToken,
      refreshToken,
    },
  }
}

const refreshToken = async (token: string) => {
  if (!token) {
    throw new AppError(401, 'Invalid Credentials')
  }

  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as CustomJwtPayload

  const user = await prisma.user.findUnique({
    where: {
      id: decoded.id,
    },
    select: userSelectWithPassword,
  })
  if (!user) {
    throw new AppError(401, 'Invalid Credentials')
  }

  if (user.role === 'VENDOR' && user.vendor?.accountStatus !== 'ACTIVE') {
    throw new AppError(403, 'Your account is not active yet. Please wait for approval.')
  }

  if (user.role === 'ADMIN' && user.admin?.adminAccountStatus !== 'ACTIVE') {
    throw new AppError(403, 'Your account is not active yet. Please wait for approval.')
  }

  const newAccessToken = jwt.sign(getJwtPayload(user), env.JWT_ACCESS_SECRET, {
    expiresIn: '7d',
  })
  return {
    success: true,
    data: {
      accessToken: newAccessToken,
    },
  }
}

const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  })

  if (!user) {
    throw new AppError(404, 'User not found')
  }

  const code = crypto.randomInt(100000, 999999).toString()

  await redis.set(`otp:${user.id}:PASSWORD_RESET`, code, 'EX', 120)

  await sendPasswordResetCodeEmail(user.email, user.name, code)
}

const resetPassword = async (email: string, code: string, newPassword: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  })

  if (!user) {
    throw new AppError(404, 'User not found')
  }

  const otpCode = await redis.get(`otp:${user.id}:PASSWORD_RESET`)

  if (!otpCode) {
    throw new AppError(400, 'Reset code not found or expired')
  }

  if (otpCode !== code) {
    throw new AppError(400, 'Invalid code')
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      password: await hashPassword(newPassword),
    },
  })

  await redis.del(`otp:${user.id}:PASSWORD_RESET`)
}

const handleGoogleAuthCallback = async (code: string, redirectUri: string) => {
  // Exchange code for token
  const tokenResponse = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const { access_token } = tokenResponse.data

  // Fetch user profile
  const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })

  const { id, email, name, picture } = profileResponse.data

  return processSocialLoginUser({ id, email, name, avatar: picture, provider: 'GOOGLE' })
}

const processSocialLoginUser = async ({
  id,
  email,
  name,
  avatar,
  provider,
}: {
  id: string
  email: string
  name: string
  avatar?: string
  provider: string
}) => {
  let user: any = await prisma.user.findUnique({
    where: { email },
    select: userSelectWithPassword,
  })

  if (!user) {
    // Auto-Register Vendor
    const hashedPassword = await hashPassword(id + process.env.JWT_ACCESS_SECRET) // dummy password

    // Generate unique subdomain based on name
    let baseSubDomain = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
    let subDomain = baseSubDomain
    let counter = 1
    while (await prisma.vendor.findUnique({ where: { subDomain } })) {
      subDomain = `${baseSubDomain}${counter}`
      counter++
    }

    const firstDistrict = await prisma.district.findFirst()
    const firstDivision = await prisma.division.findFirst()

    if (!firstDistrict || !firstDivision) {
      throw new AppError(
        500,
        'Database not properly seeded. Missing District/Division for auto-registration.'
      )
    }

    user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: `google_${id}`,
        role: UserRole.VENDOR,
        isVerified: true,
        avatar: avatar || null, // ✅ ফিক্স: user টেবিলেও avatar সেট করা হচ্ছে
        vendor: {
          create: {
            shopName: `${name}'s Shop`,
            subDomain,
            avatar: avatar || null,
            accountStatus: VendorAccountStatus.ACTIVE,
            deliveryCharge: { create: {} },
            address: {
              create: {
                area: 'Auto Generated Address',
                district: { connect: { id: firstDistrict.id } },
                division: { connect: { id: firstDivision.id } },
              },
            },
          },
        },
      },
      select: userSelectFields,
    })

    if (user && user.vendor) {
      await createTrialForVendor(user.vendor.id)
      // await addDomainToCoolify(user.vendor.subDomain) // DO NOT ADD DUMMY DOMAIN YET, WAIT FOR ONBOARDING
    }
  }

  if (!user) {
    throw new AppError(500, 'Failed to process social login user')
  }

  // Account status checks
  validateUserStatus(user)

  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      // ✅ ফিক্স: DB এর avatar না থাকলে গুগলের avatar fallback হিসেবে ব্যবহার
      avatar: user.avatar || user.vendor?.avatar || avatar || null,
      shopName: user.vendor?.shopName,
      subDomain: user.vendor?.subDomain,
      isOnboardingComplete: user.vendor?.isOnboardingComplete ?? false,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '7d' }
  )

  return { user, accessToken }
}

const completeVendorOnboarding = async (userId: string, payload: any) => {
  const { shopName, subDomain, phone, area, districtName, divisionName } = payload

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { vendor: { include: { address: true } } },
  })

  if (!user || !user.vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  if (user.vendor.isOnboardingComplete) {
    throw new AppError(400, 'Onboarding already completed')
  }

  // Validate phone uniqueness
  const phoneExists = await prisma.user.findFirst({
    where: { phone, NOT: { id: userId } },
  })
  if (phoneExists) {
    throw new AppError(400, 'This phone number is already registered')
  }

  // Validate subdomain uniqueness
  const subDomainFormatted = subDomain.toLowerCase().replace(/\s+/g, '')
  const subdomainExists = await prisma.vendor.findFirst({
    where: { subDomain: subDomainFormatted, NOT: { userId } },
  })
  if (subdomainExists) {
    throw new AppError(400, 'This subdomain is already taken')
  }

  // Validate district & division
  const district = districtName
    ? await prisma.district.findUnique({ where: { name: districtName } })
    : null
  const division = divisionName
    ? await prisma.division.findUnique({ where: { name: divisionName } })
    : null

  if (districtName && !district) throw new AppError(400, `District "${districtName}" not found.`)
  if (divisionName && !division) throw new AppError(400, `Division "${divisionName}" not found.`)

  await prisma.user.update({ where: { id: userId }, data: { phone } })

  if (district && division && user.vendor.address) {
    await prisma.address.update({
      where: { id: user.vendor.addressId },
      data: { area, districtId: district.id, divisionId: division.id },
    })
  }

  await prisma.vendor.update({
    where: { userId },
    data: { shopName, subDomain: subDomainFormatted, isOnboardingComplete: true },
  })

  await addDomainToCoolify(subDomainFormatted)

  return { message: 'Onboarding completed successfully' }
}

const checkSubdomainAvailability = async (subDomain: string, excludeUserId?: string) => {
  const formatted = subDomain.toLowerCase().replace(/\s+/g, '')
  const existing = await prisma.vendor.findFirst({
    where: {
      subDomain: formatted,
      ...(excludeUserId ? { NOT: { userId: excludeUserId } } : {}),
    },
  })
  return { isAvailable: !existing, subDomain: formatted }
}

const checkPhoneAvailability = async (phone: string, excludeUserId?: string) => {
  const existing = await prisma.user.findFirst({
    where: {
      phone,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
  })
  return { isAvailable: !existing }
}

export const AuthService = {
  registerUser,
  verifyEmail,
  loginUser,
  refreshToken,
  forgotPassword,
  resetPassword,
  resendVerificationCode,
  socialLogin,
  handleGoogleAuthCallback,
  completeVendorOnboarding,
  checkSubdomainAvailability,
  checkPhoneAvailability,
}
