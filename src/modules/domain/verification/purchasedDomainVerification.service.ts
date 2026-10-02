import { DomainStatus, PurchasedDomainStatus } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'

import { getCloudflareCustomHostname } from '../cloudflare/cloudflareCustomHostname.client.js'

import { getCloudflareVerificationSnapshot } from '../cloudflare/cloudflareCustomHostname.helper.js'

import type { CloudflareCustomHostnameResult } from '../cloudflare/cloudflareCustomHostname.types.js'

const isCloudflareHostnameActive = (cloudflareHostname: CloudflareCustomHostnameResult) => {
  return cloudflareHostname.status === 'active' && cloudflareHostname.sslStatus === 'active'
}

export const verifyPurchasedDomainActivation = async (purchasedDomainId: string) => {
  const normalizedPurchasedDomainId = purchasedDomainId.trim()

  if (!normalizedPurchasedDomainId) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Purchased domain ID is missing')
  }

  const purchasedDomain = await prisma.purchasedDomain.findUnique({
    where: {
      id: normalizedPurchasedDomainId,
    },
    select: {
      id: true,
      vendorId: true,
      domain: true,

      status: true,
      customDomainId: true,
      dnsConfiguredAt: true,

      customDomain: {
        select: {
          id: true,
          domain: true,

          cloudflareId: true,
          status: true,
        },
      },
    },
  })

  if (!purchasedDomain) {
    throw new AppError(httpStatus.NOT_FOUND, 'Purchased domain not found')
  }

  if (purchasedDomain.status === PurchasedDomainStatus.ACTIVE) {
    return {
      checked: false as const,
      activated: true as const,

      purchasedDomainId: purchasedDomain.id,

      customDomainId: purchasedDomain.customDomainId,

      domain: purchasedDomain.domain,

      status: PurchasedDomainStatus.ACTIVE,
    }
  }

  if (purchasedDomain.status !== PurchasedDomainStatus.READY_TO_ACTIVATE) {
    return {
      checked: false as const,
      activated: false as const,

      purchasedDomainId: purchasedDomain.id,

      customDomainId: purchasedDomain.customDomainId,

      domain: purchasedDomain.domain,

      status: purchasedDomain.status,
    }
  }

  const customDomain = purchasedDomain.customDomain

  if (
    !purchasedDomain.customDomainId ||
    !customDomain ||
    customDomain.id !== purchasedDomain.customDomainId ||
    !customDomain.cloudflareId
  ) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Purchased domain activation data is incomplete'
    )
  }

  const normalizedDomain = purchasedDomain.domain.trim().toLowerCase()

  if (customDomain.domain.trim().toLowerCase() !== normalizedDomain) {
    throw new AppError(httpStatus.CONFLICT, 'Custom domain does not match the purchased domain')
  }

  const cloudflareHostname = await getCloudflareCustomHostname(
    customDomain.cloudflareId,
    normalizedDomain
  )

  const verificationRecords = getCloudflareVerificationSnapshot(cloudflareHostname)

  if (!isCloudflareHostnameActive(cloudflareHostname)) {
    const pendingUpdate = await prisma.customDomain.updateMany({
      where: {
        id: customDomain.id,

        vendorId: purchasedDomain.vendorId,

        domain: normalizedDomain,

        cloudflareId: cloudflareHostname.id,
      },
      data: {
        status: DomainStatus.CONFIGURING,

        cloudflareStatus: cloudflareHostname.status,

        verificationRecords,
      },
    })

    if (pendingUpdate.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Custom domain state changed during activation verification'
      )
    }

    return {
      checked: true as const,
      activated: false as const,
      pending: true as const,

      purchasedDomainId: purchasedDomain.id,

      customDomainId: customDomain.id,

      domain: normalizedDomain,

      hostnameStatus: cloudflareHostname.status,

      sslStatus: cloudflareHostname.sslStatus,

      status: PurchasedDomainStatus.READY_TO_ACTIVATE,
    }
  }

  await prisma.$transaction(async (tx) => {
    const customDomainUpdate = await tx.customDomain.updateMany({
      where: {
        id: customDomain.id,

        vendorId: purchasedDomain.vendorId,

        domain: normalizedDomain,

        cloudflareId: cloudflareHostname.id,
      },
      data: {
        status: DomainStatus.VERIFIED,

        cloudflareStatus: cloudflareHostname.status,

        verificationRecords,
      },
    })

    if (customDomainUpdate.count === 0) {
      throw new AppError(httpStatus.CONFLICT, 'Custom domain state changed before activation')
    }

    const purchasedDomainUpdate = await tx.purchasedDomain.updateMany({
      where: {
        id: purchasedDomain.id,

        vendorId: purchasedDomain.vendorId,

        domain: normalizedDomain,

        customDomainId: customDomain.id,

        status: PurchasedDomainStatus.READY_TO_ACTIVATE,
      },
      data: {
        status: PurchasedDomainStatus.ACTIVE,
      },
    })

    if (purchasedDomainUpdate.count === 0) {
      throw new AppError(httpStatus.CONFLICT, 'Purchased domain state changed before activation')
    }
  })

  return {
    checked: true as const,
    activated: true as const,
    pending: false as const,

    purchasedDomainId: purchasedDomain.id,

    customDomainId: customDomain.id,

    domain: normalizedDomain,

    hostnameStatus: cloudflareHostname.status,

    sslStatus: cloudflareHostname.sslStatus,

    customDomainStatus: DomainStatus.VERIFIED,

    status: PurchasedDomainStatus.ACTIVE,
  }
}
