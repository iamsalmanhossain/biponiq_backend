import redis from '../../config/redis.config.js'
import status from 'http-status'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { TVendorUpdate } from './vendor.validation.js'
import { SubscriptionService } from '../subscription/subscription.service.js'
import { SubscriptionPlanType } from '@prisma/client'
import { getVendorSubscriptionAccess } from '../subscription/subscription.helper.js'
import { deleteImageHandler } from '../../modules/upload/uploadHandler.js'
import { uploadSingleImage } from '../upload/uploadHandler.js'
import { ImageType } from '../../services/storage/image.types.js'
import { upsertVendorDeliveryCharge } from './deliveryCharge.service.js'
import { VisitorTrackingService } from '../visitorTracking/visitorTracking.service.js'

type StorefrontDeliveryCharge = {
  insideCharge: number
  outsideCharge: number
}

const getStorefrontDeliveryCharge = (
  pageConfig: TVendorUpdate['pageConfig']
): StorefrontDeliveryCharge | null => {
  if (!pageConfig) return null

  const delivery = pageConfig['delivery']

  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) {
    return null
  }

  const insideCharge = delivery['insideDhaka']
  const outsideCharge = delivery['outsideDhaka']
  const hasDeliveryCharge = insideCharge !== undefined || outsideCharge !== undefined

  if (!hasDeliveryCharge) return null

  if (
    typeof insideCharge !== 'number' ||
    !Number.isFinite(insideCharge) ||
    insideCharge < 0 ||
    typeof outsideCharge !== 'number' ||
    !Number.isFinite(outsideCharge) ||
    outsideCharge < 0
  ) {
    throw new AppError(
      status.BAD_REQUEST,
      'Storefront delivery charges must be non-negative numbers'
    )
  }

  return {
    insideCharge,
    outsideCharge,
  }
}

// get vendor profile

const getMyVendorProfile = async (userId: string) => {
  const result = await prisma.vendor.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      avatar: true,
      shopName: true,
      shopLogo: true,
      subDomain: true,
      pageConfig: true,
      draftConfig: true,
      customDomain: {
        select: {
          domain: true,
          status: true,
        },
      },
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  })

  return result
}

// update vendor profile
const updateVendorProfile = async (userId: string, payload: TVendorUpdate) => {
  const { name, phone, ...vendorData } = payload

  const isLandingPageUpdate = payload.pageConfig !== undefined || payload.draftConfig !== undefined
  const storefrontDeliveryCharge = getStorefrontDeliveryCharge(payload.pageConfig)
  let landingPageVendorId: string | null = null

  if (isLandingPageUpdate) {
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    })

    if (!vendor) {
      throw new AppError(status.NOT_FOUND, 'Vendor not found')
    }

    landingPageVendorId = vendor.id
    await SubscriptionService.ensureVendorHasActiveSubscription(vendor.id)
  }

  const updateData = Object.fromEntries(
    Object.entries(vendorData).filter(([, value]) => value !== undefined)
  )

  try {
    const result = await prisma.$transaction(async tx => {
      const updatedVendor = await tx.vendor.update({
        where: { userId },
        data: {
          ...updateData,
          user: {
            update: {
              ...(name && { name }),
              ...(phone && { phone }),
            },
          },
        },
        select: {
          avatar: true,
          shopName: true,
          shopLogo: true,
          pageConfig: true,
          draftConfig: true,
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      })

      if (storefrontDeliveryCharge && landingPageVendorId) {
        await upsertVendorDeliveryCharge(tx, landingPageVendorId, storefrontDeliveryCharge)
      }

      return updatedVendor
    })

    if (storefrontDeliveryCharge && landingPageVendorId) {
      await redis.del(`delivery_charge:${landingPageVendorId}`)
    }

    if (updateData.subDomain) {
      const { addDomainToCoolify } = await import('../../shared/utils/coolify.service.js')
      await addDomainToCoolify(updateData.subDomain as string)
    }

    const fullVendor = await prisma.vendor.findUnique({
      where: { userId },
      include: { customDomain: true },
    })

    if (fullVendor) {
      if (fullVendor.subDomain) {
        await redis.del(`vendor_profile:${fullVendor.subDomain}`)
        await redis.del(`vendor_profile:${fullVendor.subDomain.toLowerCase()}`)
      }
      if (fullVendor.customDomain?.domain) {
        await redis.del(`vendor_profile:${fullVendor.customDomain.domain}`)
        await redis.del(`vendor_profile:${fullVendor.customDomain.domain.toLowerCase()}`)
      }

      // Cloudflare Cache Purge
      if (isLandingPageUpdate) {
        const { CloudflareService } = await import('../../shared/utils/cloudflare.service.js')
        const hostsToPurge = []
        if (fullVendor.subDomain) hostsToPurge.push(`${fullVendor.subDomain}.biponiq.com`)
        if (fullVendor.customDomain?.status === 'VERIFIED' && fullVendor.customDomain.domain) {
          hostsToPurge.push(fullVendor.customDomain.domain)
        }

        if (hostsToPurge.length > 0) {
          await CloudflareService.purgeCacheByHostnames(hostsToPurge)
        }
      }
    }

    return result
  } catch (error) {
    throw error
  }
}

const getPublicVendorProfile = async (identifier: string) => {
  const cleanId = identifier.trim().toLowerCase()
  const cacheKey = `vendor_profile:${cleanId}`
  const cachedProfile = await redis.get(cacheKey)

  if (cachedProfile) {
    return JSON.parse(cachedProfile)
  }

  const vendor = await prisma.vendor.findFirst({
    where: {
      OR: [{ subDomain: identifier }, { customDomain: { domain: identifier } }],
    },
    select: {
      id: true,
      shopName: true,
      shopLogo: true,
      subDomain: true,
      pageConfig: true,
      draftConfig: true,
      pixelId: true,
      tiktokPixelId: true,
      socialLinks: true,
      user: {
        select: {
          phone: true,
        },
      },
      customDomain: {
        select: {
          domain: true,
          status: true,
        },
      },
    },
  })

  if (!vendor) return null

  // NOTE: We no longer redirect if vendor has custom domain - the middleware handles routing

  const subscription = await prisma.vendorSubscription.findFirst({
    where: {
      vendorId: vendor.id,
      endDate: {
        not: null,
      },
      plan: {
        type: {
          in: [
            SubscriptionPlanType.FREE_TRIAL,
            SubscriptionPlanType.STANDARD,
            SubscriptionPlanType.MEDIUM,
            SubscriptionPlanType.PREMIUM,
          ],
        },
      },
    },
    orderBy: {
      endDate: 'desc',
    },
    select: {
      id: true,
      status: true,
      endDate: true,
      plan: {
        select: {
          type: true,
          name: true,
        },
      },
    },
  })

  const access = getVendorSubscriptionAccess(subscription)

  const trackingEntitlement = await VisitorTrackingService.getVendorTrackingEntitlement(vendor.id)
  const isLimitReached = trackingEntitlement.reason === 'QUOTA_REACHED'

  const finalProfile = {
    ...vendor,
    subscriptionAccess: {
      ...access,
      isPublicVisible:
        access.accessStatus !== 'EXPIRED_BLOCKED' && 
        access.accessStatus !== 'NO_SUBSCRIPTION' &&
        !isLimitReached,
      limitExceeded: isLimitReached,
    },
  }

  await redis.set(cacheKey, JSON.stringify(finalProfile), 'EX', 3600)

  return finalProfile
}

const deleteVendor = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: {
      userId: true,
    },
  })

  if (!vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  await prisma.user.update({
    where: { id: vendor.userId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  })

  return {
    success: true,
    message: 'Vendor  delete successful',
    data: {
      id: userId,
      isDeleted: true,
    },
  }
}

// upload shop-logo
const uploadShopLogo = async (userId: string, file: Express.Multer.File) => {
  // Find vendor
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: {
      id: true,
      shopLogo: true,
    },
  })

  if (!vendor) {
    throw new AppError(status.NOT_FOUND, 'Vendor not found')
  }

  // Don't allow upload if a logo already exists
  if (vendor.shopLogo) {
    throw new AppError(
      status.BAD_REQUEST,
      'A shop logo already exists. Please delete it before uploading a new one.'
    )
  }

  // Upload to R2
  const uploaded = await uploadSingleImage(file, 'shop_logo', ImageType.SHOP_LOGO)

  // Save to database
  const result = await prisma.vendor.update({
    where: {
      id: vendor.id,
    },
    data: {
      shopLogo: uploaded.imageUrl,
      shopLogoKey: uploaded.imageKey,
    },
    select: {
      shopLogo: true,
      shopLogoKey: true,
    },
  })

  return result
}

// delete shop-logo
const deleteShopLogo = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: {
      id: true,
      shopLogoKey: true,
    },
  })

  if (!vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  try {
    if (vendor.shopLogoKey) {
      await deleteImageHandler(vendor.shopLogoKey)
    }
  } catch (error) {
    console.error('Failed to delete shop logo from R2:', error)
    throw new AppError(500, 'Failed to delete shop logo from storage')
  }

  await prisma.vendor.update({
    where: {
      id: vendor.id,
    },
    data: {
      shopLogo: null,
      shopLogoKey: null,
    },
  })

  return null
}

export const invalidateVendorProfileCache = async (vendorId: string) => {
  const fullVendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { customDomain: true },
  })

  if (fullVendor) {
    if (fullVendor.subDomain) {
      await redis.del(`vendor_profile:${fullVendor.subDomain}`)
      await redis.del(`vendor_profile:${fullVendor.subDomain.toLowerCase()}`)
    }
    if (fullVendor.customDomain?.domain) {
      await redis.del(`vendor_profile:${fullVendor.customDomain.domain}`)
      await redis.del(`vendor_profile:${fullVendor.customDomain.domain.toLowerCase()}`)
    }
  }
}

export const VendorService = {
  getMyVendorProfile,
  updateVendorProfile,
  deleteVendor,
  getPublicVendorProfile,
  uploadShopLogo,
  deleteShopLogo,
  invalidateVendorProfileCache,
}
