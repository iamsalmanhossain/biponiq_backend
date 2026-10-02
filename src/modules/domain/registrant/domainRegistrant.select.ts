import type { Prisma } from '@prisma/client'

export const vendorDomainRegistrantSelect = {
  id: true,

  firstName: true,
  lastName: true,
  organizationName: true,

  address1: true,
  city: true,
  stateProvince: true,
  postalCode: true,
  country: true,

  phone: true,
  emailAddress: true,

  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VendorDomainRegistrantSelect

export type VendorDomainRegistrantRecord = Prisma.VendorDomainRegistrantGetPayload<{
  select: typeof vendorDomainRegistrantSelect
}>
