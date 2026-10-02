import { DomainStatus, PurchasedDomainStatus } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import { CloudflareCustomHostnameResult } from '../cloudflare/cloudflareCustomHostname.types.js'
import {
  createCloudflareCustomHostname,
  findCloudflareCustomHostnameByHostname,
  getCloudflareCustomHostname,
} from '../cloudflare/cloudflareCustomHostname.client.js'
import {
  getNamecheapDomainDnsRecords,
  setNamecheapDomainDnsRecords,
} from '../namecheap/namecheap.client.js'
import { mergePurchasedDomainDnsRecords } from '../dns/domainDnsRecords.helper.js'
import { buildPurchasedDomainRequiredDnsRecords } from '../dns/cloudflareDnsRecords.helper.js'
import { env } from '../../../config/env.js'
import { getCloudflareVerificationSnapshot } from '../cloudflare/cloudflareCustomHostname.helper.js'

const CLOUDFLARE_DNS_DETAILS_MAX_ATTEMPTS = 3

const CLOUDFLARE_DNS_DETAILS_DELAY_MS = 2_000

const DNS_CONFIGURATION_STALE_AFTER_MS = 2 * 60 * 1_000

const waitForCloudflareDetails = (delayMs: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

const hasCloudflareSslValidationRecord = (cloudflareHostname: CloudflareCustomHostnameResult) => {
  return cloudflareHostname.sslValidationRecords.some((record) => {
    const hasTxtRecord = Boolean(record.txtName) && Boolean(record.txtValue)

    const hasCnameRecord = Boolean(record.cname) && Boolean(record.cnameTarget)

    return hasTxtRecord || hasCnameRecord
  })
}

const hasCloudflareDnsDetails = (cloudflareHostname: CloudflareCustomHostnameResult) => {
  const hostnameVerificationReady =
    cloudflareHostname.status === 'active' || cloudflareHostname.ownershipVerification !== null

  const sslValidationReady =
    cloudflareHostname.sslStatus === 'active' ||
    hasCloudflareSslValidationRecord(cloudflareHostname)

  return hostnameVerificationReady && sslValidationReady
}

const getCloudflareHostnameForDnsConfiguration = async ({
  cloudflareId,
  domain,
}: {
  cloudflareId: string
  domain: string
}) => {
  let cloudflareHostname = await getCloudflareCustomHostname(cloudflareId, domain)

  for (let attempt = 1; attempt < CLOUDFLARE_DNS_DETAILS_MAX_ATTEMPTS; attempt += 1) {
    if (hasCloudflareDnsDetails(cloudflareHostname)) {
      return cloudflareHostname
    }

    await waitForCloudflareDetails(CLOUDFLARE_DNS_DETAILS_DELAY_MS)

    cloudflareHostname = await getCloudflareCustomHostname(cloudflareId, domain)
  }

  return cloudflareHostname
}

const getDnsConfigurationFailureMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500)
  }

  return 'Purchased domain DNS configuration failed'
}

const markPurchasedDomainDnsAsConfigured = async ({
  purchasedDomainId,
  vendorId,
  domain,
  customDomainId,
  cloudflareHostname,
}: {
  purchasedDomainId: string
  vendorId: string
  domain: string
  customDomainId: string

  cloudflareHostname: CloudflareCustomHostnameResult
}) => {
  const configuredAt = new Date()

  const verificationRecords = getCloudflareVerificationSnapshot(cloudflareHostname)

  await prisma.$transaction(async (tx) => {
    const customDomainUpdate = await tx.customDomain.updateMany({
      where: {
        id: customDomainId,
        vendorId,
        domain,
      },
      data: {
        status: DomainStatus.CONFIGURING,

        cloudflareId: cloudflareHostname.id,

        cloudflareStatus: cloudflareHostname.status,

        verificationRecords,
      },
    })

    if (customDomainUpdate.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Custom domain state changed before DNS configuration completed'
      )
    }

    const purchasedDomainUpdate = await tx.purchasedDomain.updateMany({
      where: {
        id: purchasedDomainId,
        vendorId,
        domain,

        status: PurchasedDomainStatus.DNS_CONFIGURING,
      },
      data: {
        status: PurchasedDomainStatus.READY_TO_ACTIVATE,

        customDomainId,

        dnsConfiguredAt: configuredAt,
      },
    })

    if (purchasedDomainUpdate.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Purchased domain state changed before DNS configuration completed'
      )
    }
  })

  return configuredAt
}

export const markPurchasedDomainDnsConfigurationAsFailed = async (
  purchasedDomainId: string,
  error: unknown
) => {
  const failureUpdate = await prisma.purchasedDomain.updateMany({
    where: {
      id: purchasedDomainId,

      status: PurchasedDomainStatus.DNS_CONFIGURING,
    },
    data: {
      status: PurchasedDomainStatus.DNS_FAILED,

      failureCode: 'DOMAIN_DNS_CONFIGURATION_FAILED',

      failureMessage: getDnsConfigurationFailureMessage(error),
    },
  })

  return {
    failed: failureUpdate.count > 0,
  }
}

export const claimPurchasedDomainDnsConfiguration = async (purchasedDomainId: string) => {
  const registeredDomainClaim = await prisma.purchasedDomain.updateMany({
    where: {
      id: purchasedDomainId,
      status: PurchasedDomainStatus.REGISTERED,
    },
    data: {
      status: PurchasedDomainStatus.DNS_CONFIGURING,
    },
  })

  let claimed = registeredDomainClaim.count > 0

  if (!claimed) {
    const failedDomainRetryClaim = await prisma.purchasedDomain.updateMany({
      where: {
        id: purchasedDomainId,
        status: PurchasedDomainStatus.DNS_FAILED,
      },
      data: {
        status: PurchasedDomainStatus.DNS_CONFIGURING,

        failureCode: null,
        failureMessage: null,
      },
    })

    claimed = failedDomainRetryClaim.count > 0
  }

  if (!claimed) {
    const staleBefore = new Date(Date.now() - DNS_CONFIGURATION_STALE_AFTER_MS)

    const staleConfigurationClaim = await prisma.purchasedDomain.updateMany({
      where: {
        id: purchasedDomainId,

        status: PurchasedDomainStatus.DNS_CONFIGURING,

        updatedAt: {
          lt: staleBefore,
        },
      },
      data: {
        updatedAt: new Date(),
      },
    })

    claimed = staleConfigurationClaim.count > 0
  }

  if (!claimed) {
    const currentPurchasedDomain = await prisma.purchasedDomain.findUnique({
      where: {
        id: purchasedDomainId,
      },
      select: {
        status: true,
        customDomainId: true,
        dnsConfiguredAt: true,
      },
    })

    if (!currentPurchasedDomain) {
      throw new AppError(httpStatus.NOT_FOUND, 'Purchased domain not found')
    }

    return {
      claimed: false as const,
      status: currentPurchasedDomain.status,

      customDomainId: currentPurchasedDomain.customDomainId,

      dnsConfiguredAt: currentPurchasedDomain.dnsConfiguredAt,
    }
  }

  const purchasedDomain = await prisma.purchasedDomain.findUnique({
    where: {
      id: purchasedDomainId,
    },
    select: {
      id: true,
      vendorId: true,
      domain: true,
      status: true,

      customDomainId: true,
      dnsConfiguredAt: true,

      failureCode: true,
      failureMessage: true,
    },
  })

  if (!purchasedDomain) {
    throw new AppError(httpStatus.NOT_FOUND, 'Claimed purchased domain not found')
  }

  return {
    claimed: true as const,
    purchasedDomain,
  }
}

export const preparePurchasedDomainCustomDomain = async ({
  purchasedDomainId,
  vendorId,
  domain,
}: {
  purchasedDomainId: string
  vendorId: string
  domain: string
}) => {
  const normalizedPurchasedDomainId = purchasedDomainId.trim()

  const normalizedDomain = domain.trim().toLowerCase()

  if (!normalizedPurchasedDomainId || !vendorId.trim() || !normalizedDomain) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Purchased domain attachment data is incomplete'
    )
  }

  const existingVendorDomain = await prisma.customDomain.findUnique({
    where: {
      vendorId,
    },
    select: {
      id: true,
      vendorId: true,
      domain: true,

      cloudflareId: true,
      cloudflareStatus: true,
      verificationRecords: true,

      status: true,

      purchasedDomain: {
        select: {
          id: true,
        },
      },
    },
  })

  if (existingVendorDomain) {
    const existingDomainName = existingVendorDomain.domain.trim().toLowerCase()

    if (existingDomainName !== normalizedDomain) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Another custom domain is already attached to this vendor'
      )
    }

    const linkedPurchasedDomainId = existingVendorDomain.purchasedDomain?.id ?? null

    if (linkedPurchasedDomainId && linkedPurchasedDomainId !== normalizedPurchasedDomainId) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Custom domain is already linked to another purchased domain'
      )
    }

    if (
      existingVendorDomain.status === DomainStatus.PENDING ||
      existingVendorDomain.status === DomainStatus.REJECTED
    ) {
      const updatedCustomDomain = await prisma.customDomain.update({
        where: {
          id: existingVendorDomain.id,
        },
        data: {
          status: DomainStatus.CONFIGURING,
        },
        select: {
          id: true,
          vendorId: true,
          domain: true,

          cloudflareId: true,
          cloudflareStatus: true,
          verificationRecords: true,

          status: true,
        },
      })

      return {
        created: false as const,
        customDomain: updatedCustomDomain,
      }
    }

    return {
      created: false as const,
      customDomain: existingVendorDomain,
    }
  }

  const domainOwner = await prisma.customDomain.findUnique({
    where: {
      domain: normalizedDomain,
    },
    select: {
      id: true,
      vendorId: true,
    },
  })

  if (domainOwner) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Purchased domain is already attached to another vendor'
    )
  }

  const createdCustomDomain = await prisma.customDomain.create({
    data: {
      vendorId,
      domain: normalizedDomain,

      status: DomainStatus.CONFIGURING,
    },
    select: {
      id: true,
      vendorId: true,
      domain: true,

      cloudflareId: true,
      cloudflareStatus: true,
      verificationRecords: true,

      status: true,

      purchasedDomain: {
        select: {
          id: true,
        },
      },
    },
  })

  return {
    created: true as const,
    customDomain: createdCustomDomain,
  }
}

export const ensurePurchasedDomainCloudflareHostname = async ({
  customDomainId,
  domain,
}: {
  customDomainId: string
  domain: string
}) => {
  const normalizedDomain = domain.trim().toLowerCase()

  if (!customDomainId.trim() || !normalizedDomain) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Custom domain provisioning data is incomplete'
    )
  }

  const customDomain = await prisma.customDomain.findUnique({
    where: {
      id: customDomainId,
    },
    select: {
      id: true,
      domain: true,

      cloudflareId: true,
      status: true,
    },
  })

  if (!customDomain) {
    throw new AppError(httpStatus.NOT_FOUND, 'Custom domain not found')
  }

  if (customDomain.domain.trim().toLowerCase() !== normalizedDomain) {
    throw new AppError(httpStatus.CONFLICT, 'Custom domain does not match the purchased domain')
  }

  let cloudflareHostname: CloudflareCustomHostnameResult

  let hostnameSource: 'stored' | 'existing' | 'created'

  if (customDomain.cloudflareId) {
    cloudflareHostname = await getCloudflareCustomHostname(
      customDomain.cloudflareId,
      normalizedDomain
    )

    hostnameSource = 'stored'
  } else {
    const existingCloudflareHostname =
      await findCloudflareCustomHostnameByHostname(normalizedDomain)

    if (existingCloudflareHostname) {
      cloudflareHostname = existingCloudflareHostname

      hostnameSource = 'existing'
    } else {
      cloudflareHostname = await createCloudflareCustomHostname(normalizedDomain)

      hostnameSource = 'created'
    }
  }

  const verificationRecords = getCloudflareVerificationSnapshot(cloudflareHostname)

  const customDomainUpdate = await prisma.customDomain.updateMany({
    where: {
      id: customDomain.id,
      domain: normalizedDomain,
    },
    data: {
      cloudflareId: cloudflareHostname.id,

      cloudflareStatus: cloudflareHostname.status,

      verificationRecords,
    },
  })

  if (customDomainUpdate.count === 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Custom domain state changed before Cloudflare details were saved'
    )
  }

  return {
    customDomainId: customDomain.id,

    cloudflareId: cloudflareHostname.id,

    domain: cloudflareHostname.hostname,

    hostnameStatus: cloudflareHostname.status,

    sslStatus: cloudflareHostname.sslStatus,

    hostnameSource,

    ownershipVerificationReady: cloudflareHostname.ownershipVerification !== null,

    sslValidationRecordCount: cloudflareHostname.sslValidationRecords.length,
  }
}

export const configurePurchasedDomainDns = async ({
  purchasedDomainId,
  vendorId,
  domain,
  customDomainId,
  cloudflareId,
}: {
  purchasedDomainId: string
  vendorId: string
  domain: string
  customDomainId: string
  cloudflareId: string
}) => {
  const normalizedDomain = domain.trim().toLowerCase()

  if (
    !purchasedDomainId.trim() ||
    !vendorId.trim() ||
    !normalizedDomain ||
    !customDomainId.trim() ||
    !cloudflareId.trim()
  ) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Purchased domain DNS configuration data is incomplete'
    )
  }

  const routingTarget = env.CLOUDFLARE_SAAS_TARGET?.trim().toLowerCase()

  if (!routingTarget) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Cloudflare SaaS routing target is not configured'
    )
  }

  const cloudflareHostname = await getCloudflareHostnameForDnsConfiguration({
    cloudflareId,
    domain: normalizedDomain,
  })

  const requiredRecords = buildPurchasedDomainRequiredDnsRecords({
    domain: normalizedDomain,
    routingTarget,
    cloudflareHostname,
  })

  const currentDns = await getNamecheapDomainDnsRecords(normalizedDomain)

  if (!currentDns.isUsingNamecheapDns) {
    throw new AppError(httpStatus.CONFLICT, 'Purchased domain is not using Namecheap DNS')
  }

  const finalRecords = mergePurchasedDomainDnsRecords({
    domain: normalizedDomain,

    existingRecords: currentDns.records,

    requiredRecords,
  })

  await setNamecheapDomainDnsRecords(normalizedDomain, finalRecords)

  const dnsConfiguredAt = await markPurchasedDomainDnsAsConfigured({
    purchasedDomainId,
    vendorId,
    domain: normalizedDomain,
    customDomainId,
    cloudflareHostname,
  })

  return {
    configured: true as const,

    purchasedDomainId,
    customDomainId,

    domain: normalizedDomain,

    cloudflareId: cloudflareHostname.id,

    hostnameStatus: cloudflareHostname.status,

    sslStatus: cloudflareHostname.sslStatus,

    requiredRecordCount: requiredRecords.length,

    finalRecordCount: finalRecords.length,

    dnsConfiguredAt,

    status: PurchasedDomainStatus.READY_TO_ACTIVATE,
  }
}
