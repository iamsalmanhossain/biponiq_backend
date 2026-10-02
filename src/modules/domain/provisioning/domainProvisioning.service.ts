import httpStatus from 'http-status'

import AppError from '../../../shared/errors/AppError.js'

import {
  claimPurchasedDomainDnsConfiguration,
  configurePurchasedDomainDns,
  ensurePurchasedDomainCloudflareHostname,
  markPurchasedDomainDnsConfigurationAsFailed,
  preparePurchasedDomainCustomDomain,
} from '../attachment/purchasedDomainAttachment.service.js'
import { PurchasedDomainStatus } from '@prisma/client'

export const processPurchasedDomainDnsConfiguration = async (purchasedDomainId: string) => {
  const normalizedPurchasedDomainId = purchasedDomainId.trim()

  if (!normalizedPurchasedDomainId) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Purchased domain ID is missing')
  }

  const dnsConfigurationClaim = await claimPurchasedDomainDnsConfiguration(
    normalizedPurchasedDomainId
  )

  if (!dnsConfigurationClaim.claimed) {
    if (dnsConfigurationClaim.status === PurchasedDomainStatus.DNS_CONFIGURING) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Purchased domain DNS configuration is still in progress'
      )
    }

    return {
      processed: false as const,

      purchasedDomainId: normalizedPurchasedDomainId,

      status: dnsConfigurationClaim.status,

      customDomainId: dnsConfigurationClaim.customDomainId,

      dnsConfiguredAt: dnsConfigurationClaim.dnsConfiguredAt,
    }
  }

  const purchasedDomain = dnsConfigurationClaim.purchasedDomain

  try {
    const customDomainPreparation = await preparePurchasedDomainCustomDomain({
      purchasedDomainId: purchasedDomain.id,

      vendorId: purchasedDomain.vendorId,

      domain: purchasedDomain.domain,
    })

    const customDomain = customDomainPreparation.customDomain

    const cloudflareHostname = await ensurePurchasedDomainCloudflareHostname({
      customDomainId: customDomain.id,

      domain: purchasedDomain.domain,
    })

    const dnsConfiguration = await configurePurchasedDomainDns({
      purchasedDomainId: purchasedDomain.id,

      vendorId: purchasedDomain.vendorId,

      domain: purchasedDomain.domain,

      customDomainId: customDomain.id,

      cloudflareId: cloudflareHostname.cloudflareId,
    })

    return {
      processed: true as const,

      purchasedDomainId: purchasedDomain.id,

      customDomainId: customDomain.id,

      domain: purchasedDomain.domain,

      status: dnsConfiguration.status,

      customDomainCreated: customDomainPreparation.created,

      cloudflareHostnameSource: cloudflareHostname.hostnameSource,

      hostnameStatus: dnsConfiguration.hostnameStatus,

      sslStatus: dnsConfiguration.sslStatus,

      requiredRecordCount: dnsConfiguration.requiredRecordCount,

      finalRecordCount: dnsConfiguration.finalRecordCount,

      dnsConfiguredAt: dnsConfiguration.dnsConfiguredAt,
    }
  } catch (error) {
    await markPurchasedDomainDnsConfigurationAsFailed(purchasedDomain.id, error)

    throw error
  }
}
