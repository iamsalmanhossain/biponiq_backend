export type SaveVendorDomainRegistrantInput = {
  firstName: string
  lastName: string
  organizationName?: string | null

  address1: string
  city: string
  stateProvince: string
  postalCode: string

  phone: string
  emailAddress: string
}

export type ConfirmVendorDomainRegistrantInput = {
  registrantUpdatedAt: string
}

export type VendorDomainRegistrantStatus = 'MISSING' | 'UNCONFIRMED' | 'CONFIRMED'

export type DomainRegistrantSnapshot = {
  version: 1

  firstName: string
  lastName: string
  organizationName: string | null

  address1: string
  city: string
  stateProvince: string
  postalCode: string
  country: 'BD'

  phone: string
  emailAddress: string

  profileUpdatedAt: string
  confirmedAt: string
  capturedAt: string
}
