import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../../shared/errors/checkoutErrorCodes.js'

import {
  vendorDomainRegistrantSelect,
  type VendorDomainRegistrantRecord,
} from './domainRegistrant.select.js'

import type {
  ConfirmVendorDomainRegistrantInput,
  DomainRegistrantSnapshot,
  SaveVendorDomainRegistrantInput,
  VendorDomainRegistrantStatus,
} from './domainRegistrant.types.js'
import { Prisma } from '@prisma/client'
import { assertManagedDomainPurchaseEnabled } from '../../../shared/errors/managedDomainPurchase.guard.js'

type NormalizedVendorDomainRegistrant = {
  firstName: string
  lastName: string
  organizationName: string | null

  address1: string
  city: string
  stateProvince: string
  postalCode: string
  country: string

  phone: string
  emailAddress: string
}

const normalizeVendorDomainRegistrant = (
  payload: SaveVendorDomainRegistrantInput
): NormalizedVendorDomainRegistrant => {
  const organizationName = payload.organizationName?.trim() || null
  const localPhone = payload.phone.trim()
  const registrarPhone = `+880.${localPhone.slice(1)}`

  return {
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    organizationName,

    address1: payload.address1.trim(),
    city: payload.city.trim(),
    stateProvince: payload.stateProvince.trim(),
    postalCode: payload.postalCode.trim(),
    country: 'BD',

    phone: registrarPhone,
    emailAddress: payload.emailAddress.trim().toLowerCase(),
  }
}

const isSameVendorDomainRegistrant = (
  currentRegistrant: VendorDomainRegistrantRecord,
  normalizedRegistrant: NormalizedVendorDomainRegistrant
) => {
  return (
    currentRegistrant.firstName === normalizedRegistrant.firstName &&
    currentRegistrant.lastName === normalizedRegistrant.lastName &&
    currentRegistrant.organizationName === normalizedRegistrant.organizationName &&
    currentRegistrant.address1 === normalizedRegistrant.address1 &&
    currentRegistrant.city === normalizedRegistrant.city &&
    currentRegistrant.stateProvince === normalizedRegistrant.stateProvince &&
    currentRegistrant.postalCode === normalizedRegistrant.postalCode &&
    currentRegistrant.country === normalizedRegistrant.country &&
    currentRegistrant.phone === normalizedRegistrant.phone &&
    currentRegistrant.emailAddress === normalizedRegistrant.emailAddress
  )
}

const getRegistrantStatus = (
  registrant: VendorDomainRegistrantRecord | null
): VendorDomainRegistrantStatus => {
  if (!registrant) {
    return 'MISSING'
  }

  return registrant.confirmedAt ? 'CONFIRMED' : 'UNCONFIRMED'
}

const buildRegistrantResponse = (registrant: VendorDomainRegistrantRecord | null) => {
  return {
    status: getRegistrantStatus(registrant),
    registrant,
  }
}

const getVendorDomainRegistrant = async (vendorId: string) => {
  await assertManagedDomainPurchaseEnabled()

  const registrant = await prisma.vendorDomainRegistrant.findUnique({
    where: {
      vendorId,
    },
    select: vendorDomainRegistrantSelect,
  })

  return buildRegistrantResponse(registrant)
}

const saveVendorDomainRegistrant = async (
  vendorId: string,
  payload: SaveVendorDomainRegistrantInput
) => {
  await assertManagedDomainPurchaseEnabled()

  const normalizedRegistrant = normalizeVendorDomainRegistrant(payload)

  const currentRegistrant = await prisma.vendorDomainRegistrant.findUnique({
    where: {
      vendorId,
    },
    select: vendorDomainRegistrantSelect,
  })

  if (currentRegistrant && isSameVendorDomainRegistrant(currentRegistrant, normalizedRegistrant)) {
    return buildRegistrantResponse(currentRegistrant)
  }

  const savedRegistrant = await prisma.vendorDomainRegistrant.upsert({
    where: {
      vendorId,
    },

    create: {
      vendorId,
      ...normalizedRegistrant,
      confirmedAt: null,
    },

    update: {
      ...normalizedRegistrant,
      confirmedAt: null,
    },

    select: vendorDomainRegistrantSelect,
  })

  return buildRegistrantResponse(savedRegistrant)
}

const confirmVendorDomainRegistrant = async (
  vendorId: string,
  payload: ConfirmVendorDomainRegistrantInput
) => {
  await assertManagedDomainPurchaseEnabled()

  const expectedUpdatedAt = new Date(payload.registrantUpdatedAt)

  if (Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid domain registrant update timestamp')
  }

  const currentRegistrant = await prisma.vendorDomainRegistrant.findUnique({
    where: {
      vendorId,
    },
    select: vendorDomainRegistrantSelect,
  })

  if (!currentRegistrant) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Complete your domain registrant profile before confirming it'
    )
  }

  // If already confirmed, return the existing confirmed data instead of throwing another error.
  // Don't throw an error if already confirmed; just return the existing data.
  if (currentRegistrant.confirmedAt) {
    return buildRegistrantResponse(currentRegistrant)
  }

  const isSameRegistrantVersion =
    currentRegistrant.updatedAt.getTime() === expectedUpdatedAt.getTime()

  if (!isSameRegistrantVersion) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Your domain registrant details changed. Please review them again before confirming.'
    )
  }

  const confirmationResult = await prisma.vendorDomainRegistrant.updateMany({
    where: {
      vendorId,
      updatedAt: expectedUpdatedAt,
      confirmedAt: null,
    },

    data: {
      confirmedAt: new Date(),
    },
  })

  if (confirmationResult.count === 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Your domain registrant details changed. Please review them again before confirming.'
    )
  }

  const confirmedRegistrant = await prisma.vendorDomainRegistrant.findUnique({
    where: {
      vendorId,
    },
    select: vendorDomainRegistrantSelect,
  })

  if (!confirmedRegistrant) {
    throw new AppError(httpStatus.NOT_FOUND, 'Confirmed domain registrant profile not found')
  }

  return buildRegistrantResponse(confirmedRegistrant)
}

const getConfirmedVendorDomainRegistrantOrThrow = async (vendorId: string) => {
  const registrant = await prisma.vendorDomainRegistrant.findUnique({
    where: {
      vendorId,
    },
    select: vendorDomainRegistrantSelect,
  })

  if (!registrant) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Complete your domain registrant profile before purchasing a domain',
      CHECKOUT_ERROR_CODES.DOMAIN_CONTACT_MISSING
    )
  }

  if (!registrant.confirmedAt) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Confirm your domain registrant profile before purchasing a domain',
      CHECKOUT_ERROR_CODES.DOMAIN_CONTACT_UNCONFIRMED
    )
  }

  return registrant
}

const buildDomainRegistrantSnapshot = (
  registrant: VendorDomainRegistrantRecord
): DomainRegistrantSnapshot => {
  if (!registrant.confirmedAt) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Confirmed domain registrant timestamp is missing'
    )
  }

  return {
    version: 1,

    firstName: registrant.firstName,
    lastName: registrant.lastName,
    organizationName: registrant.organizationName,

    address1: registrant.address1,
    city: registrant.city,
    stateProvince: registrant.stateProvince,
    postalCode: registrant.postalCode,
    country: 'BD',

    phone: registrant.phone,
    emailAddress: registrant.emailAddress,

    profileUpdatedAt: registrant.updatedAt.toISOString(),

    confirmedAt: registrant.confirmedAt.toISOString(),

    capturedAt: new Date().toISOString(),
  }
}

const isDomainRegistrantSnapshotCurrent = (
  snapshot: unknown,
  registrant: VendorDomainRegistrantRecord
) => {
  if (!registrant.confirmedAt) {
    return false
  }

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return false
  }

  const snapshotData = snapshot as Record<string, unknown>

  return (
    snapshotData.version === 1 &&
    snapshotData.firstName === registrant.firstName &&
    snapshotData.lastName === registrant.lastName &&
    snapshotData.organizationName === registrant.organizationName &&
    snapshotData.address1 === registrant.address1 &&
    snapshotData.city === registrant.city &&
    snapshotData.stateProvince === registrant.stateProvince &&
    snapshotData.postalCode === registrant.postalCode &&
    snapshotData.country === registrant.country &&
    snapshotData.phone === registrant.phone &&
    snapshotData.emailAddress === registrant.emailAddress &&
    snapshotData.profileUpdatedAt === registrant.updatedAt.toISOString() &&
    snapshotData.confirmedAt === registrant.confirmedAt.toISOString()
  )
}

const createDomainRegistrantSnapshotForPayment = async (
  tx: Prisma.TransactionClient,
  vendorId: string
): Promise<DomainRegistrantSnapshot> => {
  const registrant = await tx.vendorDomainRegistrant.findUnique({
    where: {
      vendorId,
    },
    select: vendorDomainRegistrantSelect,
  })

  if (!registrant) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Complete your domain registrant profile before purchasing a domain'
    )
  }

  if (!registrant.confirmedAt) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Confirm your domain registrant profile before purchasing a domain'
    )
  }

  return buildDomainRegistrantSnapshot(registrant)
}

export const DomainRegistrantService = {
  getVendorDomainRegistrant,
  saveVendorDomainRegistrant,
  confirmVendorDomainRegistrant,
  getConfirmedVendorDomainRegistrantOrThrow,
  buildDomainRegistrantSnapshot,
  createDomainRegistrantSnapshotForPayment,
  isDomainRegistrantSnapshotCurrent,
}
