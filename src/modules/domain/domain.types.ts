import type { AllowedDomainExtension } from './domain.constants.js'

export type NamecheapDomainAvailability = {
  domain: string
  extension: AllowedDomainExtension
  available: boolean
}

export type NamecheapDomainQuote = {
  domain: string
  extension: AllowedDomainExtension
  available: boolean
  registrationYears: number

  baseRegistrationPriceUsd: number
  icannFeeUsd: number
  providerPriceUsd: number

  isPremium: boolean
}

export type DomainSellingPrice = {
  providerPriceUsd: number
  exchangeRate: number
  markupPercent: number
  registrationPriceBdt: number
}

export type DomainSellingQuote = {
  domain: string
  extension: AllowedDomainExtension
  available: boolean
  registrationYears: number

  baseRegistrationPriceUsd: number
  icannFeeUsd: number
  providerPriceUsd: number

  exchangeRate: number
  markupPercent: number
  registrationPriceBdt: number

  isPremium: boolean
  quotedAt: Date
  quoteExpiresAt: Date
}

export type VendorDomainQuote = {
  domain: string
  extension: AllowedDomainExtension
  available: boolean
  registrationYears: number
  registrationPriceBdt: number
  isPremium: boolean
  quotedAt: Date
  quoteExpiresAt: Date
}

export type NamecheapDomainContact = {
  firstName: string
  lastName: string
  address1: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
  phone: string
  emailAddress: string
  organizationName?: string
}

export type NamecheapDomainRegistrationContacts = {
  registrant: NamecheapDomainContact
  admin: NamecheapDomainContact
  tech: NamecheapDomainContact
  auxBilling: NamecheapDomainContact
}

export type NamecheapDomainRegistrationInput = {
  domain: string
  registrationYears: number
  contacts: NamecheapDomainRegistrationContacts
}

export type NamecheapDomainRegistrationResult = {
  domain: string
  registered: true
  chargedAmountUsd: number
  providerDomainId: string
  providerOrderId: string
  providerTransactionId: string
  isRealTime: boolean
}

export type NamecheapDomainInfoResult = {
  domain: string
  expiresAt: Date
}

export type NamecheapDnsRecordType =
  | 'A'
  | 'AAAA'
  | 'ALIAS'
  | 'CAA'
  | 'CNAME'
  | 'MX'
  | 'MXE'
  | 'NS'
  | 'TXT'
  | 'URL'
  | 'URL301'
  | 'FRAME'

export type NamecheapDnsRecord = {
  name: string
  type: NamecheapDnsRecordType
  address: string
  mxPreference: number | null
  ttl: number
}

export type NamecheapDomainDnsRecordsResult = {
  domain: string
  isUsingNamecheapDns: boolean
  records: NamecheapDnsRecord[]
}

export type NamecheapDomainDnsUpdateResult = {
  domain: string
  updated: true
}
