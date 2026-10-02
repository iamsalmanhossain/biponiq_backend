import { PlatformSetting } from '@prisma/client'
import axios, { HttpStatusCode } from 'axios'

import redis from '../../config/redis.config.js'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'

const PLATFORM_SETTINGS_CACHE_KEY = 'platform_settings'

type PlatformSettingsUpdatePayload = {
  enableCod?: boolean
  enableSsl?: boolean
  enableEps?: boolean
  enableMfs?: boolean
  enableFraudChecker?: boolean
  enableCoupons?: boolean
  enableDeliverySupport?: boolean
  enableManagedDomainPurchase?: boolean
}

const isPlatformSettings = (
  value: unknown
): value is PlatformSetting => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return (
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'enableCod') === 'boolean' &&
    typeof Reflect.get(value, 'enableSsl') === 'boolean' &&
    typeof Reflect.get(value, 'enableEps') === 'boolean' &&
    typeof Reflect.get(value, 'enableMfs') === 'boolean' &&
    typeof Reflect.get(value, 'enableFraudChecker') === 'boolean' &&
    typeof Reflect.get(value, 'enableCoupons') === 'boolean' &&
    typeof Reflect.get(value, 'enableDeliverySupport') === 'boolean' &&
    typeof Reflect.get(value, 'enableManagedDomainPurchase') === 'boolean'
  )
}

const createInitialSettingsData = (
  payload: PlatformSettingsUpdatePayload = {}
) => {
  return {
    id: 'singleton',
    enableCod: payload.enableCod ?? true,
    enableSsl: payload.enableSsl ?? true,
    enableEps: payload.enableEps ?? true,
    enableMfs: payload.enableMfs ?? true,
    enableFraudChecker: payload.enableFraudChecker ?? true,
    enableCoupons: payload.enableCoupons ?? true,
    enableDeliverySupport: payload.enableDeliverySupport ?? true,
    enableManagedDomainPurchase:
      payload.enableManagedDomainPurchase ?? true,
  }
}

const getSettings = async (): Promise<PlatformSetting> => {
  const cachedSettings = await redis.get(
    PLATFORM_SETTINGS_CACHE_KEY
  )

  if (cachedSettings) {
    try {
      const parsedSettings: unknown = JSON.parse(cachedSettings)

      if (isPlatformSettings(parsedSettings)) {
        return parsedSettings
      }
    } catch {
      // Ignore malformed or outdated cache and refresh from DB.
    }
  }

  let settings = await prisma.platformSetting.findUnique({
    where: {
      id: 'singleton',
    },
  })

  if (!settings) {
    settings = await prisma.platformSetting.create({
      data: createInitialSettingsData(),
    })
  }

  await redis.set(
    PLATFORM_SETTINGS_CACHE_KEY,
    JSON.stringify(settings)
  )

  return settings
}

const updateSettings = async (
  payload: PlatformSettingsUpdatePayload
) => {
  let settings = await prisma.platformSetting.findUnique({
    where: {
      id: 'singleton',
    },
  })

  if (!settings) {
    settings = await prisma.platformSetting.create({
      data: createInitialSettingsData(payload),
    })
  } else {
    settings = await prisma.platformSetting.update({
      where: {
        id: 'singleton',
      },
      data: {
        ...(payload.enableCod !== undefined && {
          enableCod: payload.enableCod,
        }),

        ...(payload.enableSsl !== undefined && {
          enableSsl: payload.enableSsl,
        }),

        ...(payload.enableEps !== undefined && {
          enableEps: payload.enableEps,
        }),

        ...(payload.enableMfs !== undefined && {
          enableMfs: payload.enableMfs,
        }),

        ...(payload.enableFraudChecker !== undefined && {
          enableFraudChecker: payload.enableFraudChecker,
        }),

        ...(payload.enableCoupons !== undefined && {
          enableCoupons: payload.enableCoupons,
        }),

        ...(payload.enableDeliverySupport !== undefined && {
          enableDeliverySupport: payload.enableDeliverySupport,
        }),

        ...(payload.enableManagedDomainPurchase !== undefined && {
          enableManagedDomainPurchase:
            payload.enableManagedDomainPurchase,
        }),
      },
    })
  }

  await redis.set(
    PLATFORM_SETTINGS_CACHE_KEY,
    JSON.stringify(settings)
  )

  return settings
}

const getPublicStats = async () => {
  const vendorsCount = await prisma.vendor.count()
  const ordersCount = await prisma.order.count()
  const templatesCount = await prisma.template.count()

  return {
    vendors: vendorsCount,
    orders: ordersCount,
    templates: templatesCount,
    uptime: 99.9,
  }
}

const updateFraudCheckerApiKey = async (
  apiKey: string | null
) => {
  const platformSetting =
    await prisma.platformSetting.findFirst()

  if (!platformSetting) {
    throw new Error('Platform setting not found')
  }

  if (!apiKey) {
    return prisma.platformSetting.update({
      where: {
        id: platformSetting.id,
      },
      data: {
        adminBdCourierApiKey: null,
        adminBdCourierApiLimit: 0,
        adminBdCourierApiUsed: 0,
      },
    })
  }

  try {
    const response = await axios.get(
      'https://api.bdcourier.com/my-plan',
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    )

    if (response.data.status === 'success') {
      const planData = response.data.data

      return prisma.platformSetting.update({
        where: {
          id: platformSetting.id,
        },
        data: {
          adminBdCourierApiKey: apiKey,
          adminBdCourierApiLimit: planData.api_calls,
          adminBdCourierApiUsed: 0,
        },
      })
    }

    throw new AppError(
      HttpStatusCode.BadRequest,
      'Invalid Api Key'
    )
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      HttpStatusCode.BadRequest,
      error?.response?.data?.message ||
        'Failed to verify API Key from BD Courier'
    )
  }
}

const getPlatformSettingsWithAlert = async () => {
  const settings = await prisma.platformSetting.findFirst()

  if (!settings) {
    return null
  }

  let totalRemaining = 0
  let lowTokenAlert = false
  let isLimitExhausted = false
  let planDetails = null

  if (settings.adminBdCourierApiKey) {
    try {
      const response = await axios.get(
        'https://api.bdcourier.com/my-plan',
        {
          headers: {
            Authorization: `Bearer ${settings.adminBdCourierApiKey}`,
          },
        }
      )

      if (response.data.status === 'success') {
        const planData = response.data.data

        planDetails = planData

        totalRemaining =
          (planData.remaining_free_calls || 0) +
          (planData.remaining_paid_calls || 0)

        lowTokenAlert =
          totalRemaining <= 3 && totalRemaining > 0

        isLimitExhausted = totalRemaining === 0
      }
    } catch {
      const limit =
        settings.adminBdCourierApiLimit ?? 0
      const used =
        settings.adminBdCourierApiUsed ?? 0

      totalRemaining = limit - used

      lowTokenAlert =
        totalRemaining <= 3 && totalRemaining > 0

      isLimitExhausted = totalRemaining <= 0
    }
  }

  return {
    ...settings,
    planDetails,
    totalRemaining,
    lowTokenAlert,
    isLimitExhausted,
  }
}

export const PlatformSettingService = {
  getSettings,
  updateSettings,
  getPublicStats,
  updateFraudCheckerApiKey,
  getPlatformSettingsWithAlert,
}