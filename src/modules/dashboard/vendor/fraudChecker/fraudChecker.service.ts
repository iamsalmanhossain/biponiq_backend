import { StatusCodes } from 'http-status-codes'
import { prisma } from '../../../../lib/prisma.js'
import AppError from '../../../../shared/errors/AppError.js'
import axios from 'axios'
import redis from '../../../../config/redis.config.js'

// add bd courier api key
const addApiKey = async (userId: string, bdCourierApiKey: string) => {
  const platformSetting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } })
  if (platformSetting && !platformSetting.enableFraudChecker) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Fraud checker feature is currently disabled by the admin.'
    )
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId },
  })
  if (!vendor) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  }
  // if(vendor.bdCourierApiKey){
  //     throw new AppError(StatusCodes.BAD_REQUEST, "API Key already exists. Please update it instead.")
  // }
  const result = await prisma.vendor.update({
    where: { userId },
    data: { bdCourierApiKey },
    select: { id: true, bdCourierApiKey: true },
  })
  return result
}

//check fraud by number

const checkFraudStatus = async (userId: string, phone: string) => {
  const cacheKey = `fraud_check:${phone}`
  const cacheData = await redis.get(cacheKey)
  if (cacheData) {
    return JSON.parse(cacheData)
  }
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: {
      id: true,
      bdCourierApiKey: true,
      adminFraudCheckUsageCount: true,
    },
  })

  const platformSetting = await prisma.platformSetting.findFirst()

  if (!vendor) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  }

  let apiKeyToUse = vendor.bdCourierApiKey
  let isUsingAdminKey = false

  if (!apiKeyToUse) {
    // ভেন্ডরের নিজস্ব API Key নেই, ফ্রি লিমিট চেক করুন
    if (vendor.adminFraudCheckUsageCount >= 3) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You have exceeded your maximum 3 free uses. Please add your own Fraud Checker API key to continue.'
      )
    }

    if (!platformSetting?.adminBdCourierApiKey) {
      throw new AppError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Admin Fraud Checker API is not configured yet. Please add your own key.'
      )
    }

    const limit = platformSetting.adminBdCourierApiLimit ?? 0
    const used = platformSetting.adminBdCourierApiUsed ?? 0

    // এডমিন API Key এর লিমিট চেক (Platform limit)
    if (limit > 0 && used >= limit) {
      throw new AppError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Platform free limit exceeded. Please add your own API key.'
      )
    }

    apiKeyToUse = platformSetting.adminBdCourierApiKey
    isUsingAdminKey = true
  }

  try {
    // hit courier API to check fraud
    const result = await axios.post(
      'https://api.bdcourier.com/courier-check',
      { phone },
      {
        headers: {
          Authorization: `Bearer ${apiKeyToUse}`, // Use Authorization header like before
          'Content-Type': 'application/json',
        },
      }
    )

    if (result.data.status === 'success') {
      // Remove PaperFly data from response
      if (result.data.data && result.data.data.paperfly) {
        delete result.data.data.paperfly
      }
      await redis.set(cacheKey, JSON.stringify(result.data), 'EX', 7200)
      // API কল সাকসেসফুল হলে কাউন্ট আপডেট
      if (isUsingAdminKey && platformSetting) {
        // remove await for get data first
        prisma.$transaction([
          prisma.vendor.update({
            where: { id: vendor.id },
            data: { adminFraudCheckUsageCount: { increment: 1 } },
          }),
          prisma.platformSetting.update({
            where: { id: platformSetting.id },
            data: { adminBdCourierApiUsed: { increment: 1 } },
          }),
        ])
      }
      return result.data
    } else {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Failed to fetch fraud data')
    }
  } catch (error: any) {
    if (error instanceof AppError) throw error
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      error.response?.data?.message || 'Error occurred while communicating with BD Courier'
    )
  }
}

const getVendorPlanDetails = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { bdCourierApiKey: true, adminFraudCheckUsageCount: true },
  })

  if (!vendor) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  }

  // যদি ভেন্ডরের নিজস্ব API Key থাকে
  if (vendor.bdCourierApiKey) {
    try {
      const response = await axios.get('https://api.bdcourier.com/my-plan', {
        headers: { Authorization: `Bearer ${vendor.bdCourierApiKey}` },
      })

      if (response.data.status === 'success') {
        const planData = response.data.data
        const totalRemaining =
          (planData.remaining_free_calls || 0) + (planData.remaining_paid_calls || 0)

        return {
          hasKey: true,
          usingAdminKey: false,
          apiKey: vendor.bdCourierApiKey,
          ...planData,
          totalRemaining,
          lowTokenAlert: totalRemaining <= 3 && totalRemaining > 0, // ৩ বা তার কম থাকলে ওয়ার্নিং
          isLimitExhausted: totalRemaining === 0, // লিমিট শেষ হলে এলার্ট
        }
      }
    } catch (error: any) {
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.response?.data?.message || 'Error fetching plan details from BD Courier'
      )
    }
  }

  // যদি নিজস্ব Key না থাকে, তবে সে এডমিনের Key ব্যবহার করছে (৩টি ফ্রি রিকোয়েস্ট)
  const freeUsesRemaining = 3 - (vendor.adminFraudCheckUsageCount || 0)
  return {
    hasKey: false,
    usingAdminKey: true,
    apiKey: null,
    totalRemaining: freeUsesRemaining,
    lowTokenAlert: freeUsesRemaining <= 1 && freeUsesRemaining > 0, // ১টি ফ্রি রিকোয়েস্ট বাকি থাকলে ওয়ার্নিং
    isLimitExhausted: freeUsesRemaining <= 0,
  }
}

export const FraudCheckerService = {
  addApiKey,
  checkFraudStatus,
  getVendorPlanDetails,
}
