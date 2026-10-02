import { PaymentStatus, PurchasedDomainStatus, type Prisma } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import type {
  NamecheapDomainContact,
  NamecheapDomainInfoResult,
  NamecheapDomainRegistrationResult,
} from '../domain.types.js'
import { getNamecheapDomainInfo, registerNamecheapDomain } from '../namecheap/namecheap.client.js'
import { getNamecheapRegistrationContact } from '../namecheap/namecheap.registration.config.js'
import { DomainRegistrantSnapshot } from '../registrant/domainRegistrant.types.js'

export type CreatePendingPurchasedDomainInput = {
  vendorId: string
  subscriptionPaymentId: string

  domain: string
  extension: string

  registrationYears: number
  registrationAmount: number
}

export const createPendingPurchasedDomain = async (
  tx: Prisma.TransactionClient,
  input: CreatePendingPurchasedDomainInput
) => {
  return tx.purchasedDomain.create({
    data: {
      vendorId: input.vendorId,
      subscriptionPaymentId: input.subscriptionPaymentId,

      domain: input.domain,
      extension: input.extension,

      registrationYears: input.registrationYears,

      registrationAmount: input.registrationAmount,

      status: PurchasedDomainStatus.REGISTRATION_PENDING,

      registrationIdempotencyKey: `domain-registration:${input.subscriptionPaymentId}`,
    },
    select: {
      id: true,
      subscriptionPaymentId: true,
      status: true,
    },
  })
}

export const claimPaidDomainRegistration = async (purchasedDomainId: string) => {
  const registrationClaim = await prisma.purchasedDomain.updateMany({
    where: {
      id: purchasedDomainId,

      status: {
        in: [PurchasedDomainStatus.REGISTRATION_PENDING, PurchasedDomainStatus.REGISTRATION_FAILED],
      },

      subscriptionPayment: {
        paymentStatus: PaymentStatus.PAID,
      },
    },
    data: {
      status: PurchasedDomainStatus.REGISTERING,

      registrationAttempts: {
        increment: 1,
      },

      failureCode: null,
      failureMessage: null,
    },
  })

  if (registrationClaim.count === 0) {
    const currentPurchasedDomain = await prisma.purchasedDomain.findUnique({
      where: {
        id: purchasedDomainId,
      },
      select: {
        status: true,

        subscriptionPayment: {
          select: {
            paymentStatus: true,
          },
        },
      },
    })

    if (!currentPurchasedDomain) {
      throw new AppError(httpStatus.NOT_FOUND, 'Purchased domain not found')
    }

    if (currentPurchasedDomain.subscriptionPayment.paymentStatus !== PaymentStatus.PAID) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Domain registration cannot start before payment is verified'
      )
    }

    return {
      claimed: false as const,
      status: currentPurchasedDomain.status,
    }
  }

  const claimedPurchasedDomain = await prisma.purchasedDomain.findUnique({
    where: {
      id: purchasedDomainId,
    },
    select: {
      id: true,
      vendorId: true,
      domain: true,
      registrationYears: true,
      registrationAmount: true,
      subscriptionPaymentId: true,
      registrationIdempotencyKey: true,
      status: true,
      registrationAttempts: true,

      subscriptionPayment: {
        select: {
          domainRegistrantSnapshot: true,
        },
      },
    },
  })

  if (!claimedPurchasedDomain) {
    throw new AppError(httpStatus.NOT_FOUND, 'Claimed purchased domain not found')
  }

  return {
    claimed: true as const,
    purchasedDomain: claimedPurchasedDomain,
  }
}

const getRequiredSnapshotString = (
  snapshot: Record<string, unknown>,
  fieldName: keyof DomainRegistrantSnapshot
) => {
  const value = snapshot[fieldName]

  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Domain registrant snapshot is missing ${fieldName}`
    )
  }

  return value
}

const getDomainRegistrantContactFromSnapshot = (
  snapshot: Prisma.JsonValue | null
): NamecheapDomainContact => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Domain registrant snapshot is missing or invalid'
    )
  }

  const snapshotData = snapshot as Record<string, unknown>

  if (snapshotData.version !== 1) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Unsupported domain registrant snapshot version'
    )
  }

  const country = getRequiredSnapshotString(snapshotData, 'country')

  if (country !== 'BD') {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Domain registrant snapshot country is invalid'
    )
  }

  const organizationName = snapshotData.organizationName

  if (
    organizationName !== null &&
    organizationName !== undefined &&
    typeof organizationName !== 'string'
  ) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Domain registrant snapshot organization name is invalid'
    )
  }

  return {
    firstName: getRequiredSnapshotString(snapshotData, 'firstName'),

    lastName: getRequiredSnapshotString(snapshotData, 'lastName'),

    address1: getRequiredSnapshotString(snapshotData, 'address1'),

    city: getRequiredSnapshotString(snapshotData, 'city'),

    stateProvince: getRequiredSnapshotString(snapshotData, 'stateProvince'),

    postalCode: getRequiredSnapshotString(snapshotData, 'postalCode'),

    country,

    phone: getRequiredSnapshotString(snapshotData, 'phone'),

    emailAddress: getRequiredSnapshotString(snapshotData, 'emailAddress'),

    ...(typeof organizationName === 'string' && organizationName.trim()
      ? {
          organizationName: organizationName.trim(),
        }
      : {}),
  }
}

const getRegistrationFailureMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500)
  }

  return 'Domain registration failed'
}

const markDomainRegistrationAsFailed = async (purchasedDomainId: string, error: unknown) => {
  await prisma.purchasedDomain.updateMany({
    where: {
      id: purchasedDomainId,
      status: PurchasedDomainStatus.REGISTERING,
    },
    data: {
      status: PurchasedDomainStatus.REGISTRATION_FAILED,

      failureCode: 'NAMECHEAP_REGISTRATION_FAILED',

      failureMessage: getRegistrationFailureMessage(error),
    },
  })
}

const markDomainRegistrationAsRegistered = async (
  purchasedDomainId: string,
  registrationResult: NamecheapDomainRegistrationResult,
  registrationExpiresAt: Date | null,
  domainInfoError: unknown | null
) => {
  const hasDomainInfoError = domainInfoError !== null

  const registrationUpdate = await prisma.purchasedDomain.updateMany({
    where: {
      id: purchasedDomainId,
      status: PurchasedDomainStatus.REGISTERING,
    },
    data: {
      status: PurchasedDomainStatus.REGISTERED,

      registrarOrderId: registrationResult.providerOrderId,

      registeredAt: new Date(),

      registrationExpiresAt,

      failureCode: hasDomainInfoError ? 'NAMECHEAP_DOMAIN_INFO_FAILED' : null,

      failureMessage: hasDomainInfoError ? getRegistrationFailureMessage(domainInfoError) : null,
    },
  })

  if (registrationUpdate.count === 0) {
    throw new AppError(httpStatus.CONFLICT, 'Domain registration state changed before completion')
  }
}

export const processPaidDomainRegistration = async (purchasedDomainId: string) => {
  const registrationClaim = await claimPaidDomainRegistration(purchasedDomainId)

  if (!registrationClaim.claimed) {
    return {
      processed: false as const,
      status: registrationClaim.status,
    }
  }

  const purchasedDomain = registrationClaim.purchasedDomain

  let registrationResult: NamecheapDomainRegistrationResult

  try {
    const vendorRegistrantContact = getDomainRegistrantContactFromSnapshot(
      purchasedDomain.subscriptionPayment.domainRegistrantSnapshot
    )

    const platformContact = getNamecheapRegistrationContact()

    registrationResult = await registerNamecheapDomain({
      domain: purchasedDomain.domain,

      registrationYears: purchasedDomain.registrationYears,

      contacts: {
        registrant: vendorRegistrantContact,

        admin: vendorRegistrantContact,

        tech: platformContact,

        auxBilling: platformContact,
      },
    })
  } catch (error) {
    await markDomainRegistrationAsFailed(purchasedDomain.id, error)

    throw error
  }

  let domainInfo: NamecheapDomainInfoResult | null = null

  let domainInfoError: unknown | null = null

  try {
    domainInfo = await getNamecheapDomainInfo(purchasedDomain.domain)
  } catch (error) {
    domainInfoError = error
  }

  const registrationExpiresAt = domainInfo?.expiresAt ?? null

  await markDomainRegistrationAsRegistered(
    purchasedDomain.id,
    registrationResult,
    registrationExpiresAt,
    domainInfoError
  )

  return {
    processed: true as const,

    purchasedDomainId: purchasedDomain.id,

    domain: purchasedDomain.domain,

    status: PurchasedDomainStatus.REGISTERED,

    registrarOrderId: registrationResult.providerOrderId,

    registrationExpiresAt,

    expirySynced: domainInfo !== null,
  }
}
