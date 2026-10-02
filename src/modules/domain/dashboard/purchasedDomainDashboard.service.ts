import { PurchasedDomainStatus } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'

const MANAGED_PURCHASED_DOMAIN_STATUSES: PurchasedDomainStatus[] = [
  PurchasedDomainStatus.REGISTERED,
  PurchasedDomainStatus.DNS_CONFIGURING,
  PurchasedDomainStatus.READY_TO_ACTIVATE,
  PurchasedDomainStatus.ACTIVE,
  PurchasedDomainStatus.DNS_FAILED,
]

const getVendorManagedPurchasedDomain = async (userId: string) => {
  const normalizedUserId = userId.trim()

  if (!normalizedUserId) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Authenticated user ID is missing')
  }

  const purchasedDomain = await prisma.purchasedDomain.findFirst({
    where: {
      vendor: {
        userId: normalizedUserId,
      },

      status: {
        in: MANAGED_PURCHASED_DOMAIN_STATUSES,
      },
    },
    select: {
      id: true,
      vendorId: true,

      domain: true,
      extension: true,

      status: true,

      registeredAt: true,
      registrationExpiresAt: true,
      dnsConfiguredAt: true,

      failureCode: true,
      failureMessage: true,

      customDomainId: true,

      customDomain: {
        select: {
          id: true,
          domain: true,
          status: true,

          cloudflareStatus: true,

          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (!purchasedDomain) {
    return null
  }

  return {
    source: 'PURCHASED' as const,
    dnsManagedByPlatform: true as const,

    purchasedDomainId: purchasedDomain.id,

    vendorId: purchasedDomain.vendorId,

    domain: purchasedDomain.domain,

    extension: purchasedDomain.extension,

    purchasedDomainStatus: purchasedDomain.status,

    registeredAt: purchasedDomain.registeredAt,

    registrationExpiresAt: purchasedDomain.registrationExpiresAt,

    dnsConfiguredAt: purchasedDomain.dnsConfiguredAt,

    failureCode: purchasedDomain.failureCode,

    failureMessage: purchasedDomain.failureMessage,

    customDomainId: purchasedDomain.customDomainId,

    customDomainStatus: purchasedDomain.customDomain?.status ?? null,

    cloudflareStatus: purchasedDomain.customDomain?.cloudflareStatus ?? null,

    createdAt: purchasedDomain.customDomain?.createdAt ?? null,

    updatedAt: purchasedDomain.customDomain?.updatedAt ?? null,
  }
}

export const PurchasedDomainDashboardService = {
  getVendorManagedPurchasedDomain,
}
