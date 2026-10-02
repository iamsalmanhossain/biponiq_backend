import { PaymentStatus, Prisma, PurchasedDomainStatus } from '@prisma/client'
import { StatusCodes } from 'http-status-codes'

import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../shared/errors/checkoutErrorCodes.js'
import type { DomainSellingQuote } from '../domain/domain.types.js'
import { DomainQuoteService } from '../domain/quote/domainQuote.service.js'

import { checkoutDraftPaymentSelect } from './subscription.select.js'

const CHECKOUT_DRAFT_EXPIRY_MINUTES = 30

const PURCHASED_DOMAIN_OWNERSHIP_STATUSES: PurchasedDomainStatus[] = [
  PurchasedDomainStatus.REGISTRATION_PENDING,
  PurchasedDomainStatus.REGISTERING,
  PurchasedDomainStatus.REGISTERED,
  PurchasedDomainStatus.DNS_CONFIGURING,
  PurchasedDomainStatus.READY_TO_ACTIVATE,
  PurchasedDomainStatus.ACTIVE,
  PurchasedDomainStatus.REGISTRATION_FAILED,
  PurchasedDomainStatus.DNS_FAILED,
]

type CheckoutDraftForPayment = Prisma.VendorCheckoutDraftGetPayload<{
  select: typeof checkoutDraftPaymentSelect
}>

type SavedCheckoutDomainQuote = {
  domain: string
  extension: string
  registrationYears: number

  baseRegistrationPriceUsd: number
  icannFeeUsd: number
  providerPriceUsd: number

  exchangeRate: number
  markupPercent: number
  registrationPriceBdt: number
}

type SubscriptionPaymentDomainData = {
  isDomainIncluded: boolean
  domain: string | null
  domainExtension: string | null
  domainRegistrationYears: number | null

  domainBaseRegistrationPriceUsd: number | null
  domainIcannFeeUsd: number | null
  domainProviderPriceUsd: number | null

  domainExchangeRate: number | null
  domainMarkupPercent: number | null
  domainRegistrationPriceBdt: number | null
  domainQuotedAt: Date | null
  domainQuoteExpiresAt: Date | null
}

export const getCheckoutDraftExpiryTime = () => {
  return new Date(Date.now() + CHECKOUT_DRAFT_EXPIRY_MINUTES * 60 * 1000)
}

export const clearCheckoutDraftDomainData = {
  selectedDomain: null,
  selectedExtension: null,
  domainRegistrationYears: null,

  domainBaseRegistrationPriceUsd: null,
  domainIcannFeeUsd: null,
  domainProviderPriceUsd: null,
  domainExchangeRate: null,
  domainMarkupPercent: null,
  domainRegistrationPriceBdt: null,

  domainQuotedAt: null,
  domainQuoteExpiresAt: null,
}

export const clearVendorCheckoutDraftDomainData = async (vendorId: string) => {
  await prisma.vendorCheckoutDraft.updateMany({
    where: {
      vendorId,
    },
    data: clearCheckoutDraftDomainData,
  })
}

const clearCheckoutDraftDomainSelection = async (draftId: string) => {
  await prisma.vendorCheckoutDraft.update({
    where: {
      id: draftId,
    },
    data: clearCheckoutDraftDomainData,
  })
}

export const ensureVendorCanPurchaseDomain = async (vendorId: string, draftId: string) => {
  const existingPurchasedDomain = await prisma.purchasedDomain.findFirst({
    where: {
      vendorId,
      subscriptionPayment: {
        paymentStatus: PaymentStatus.PAID,
      },
      status: {
        in: PURCHASED_DOMAIN_OWNERSHIP_STATUSES,
      },
    },
    select: {
      id: true,
    },
  })

  if (existingPurchasedDomain) {
    await clearCheckoutDraftDomainSelection(draftId)

    throw new AppError(
      StatusCodes.CONFLICT,
      'You already have a purchased domain for this store.',
      CHECKOUT_ERROR_CODES.DOMAIN_ALREADY_PURCHASED
    )
  }

  const existingManualCustomDomain = await prisma.customDomain.findFirst({
    where: {
      vendorId,
      purchasedDomain: {
        is: null,
      },
    },
    select: {
      id: true,
    },
  })

  if (!existingManualCustomDomain) {
    return
  }

  await clearCheckoutDraftDomainSelection(draftId)

  throw new AppError(
    StatusCodes.CONFLICT,
    'A custom domain is already connected to this store. Remove it before purchasing another domain.',
    CHECKOUT_ERROR_CODES.MANUAL_DOMAIN_ALREADY_CONNECTED
  )
}

const getSavedCheckoutDomainQuoteOrThrow = async (
  draft: CheckoutDraftForPayment
): Promise<SavedCheckoutDomainQuote> => {
  const domain = draft.selectedDomain?.trim()
  const extension = draft.selectedExtension?.trim()
  const registrationYears = draft.domainRegistrationYears
  const baseRegistrationPriceUsd = draft.domainBaseRegistrationPriceUsd

  const icannFeeUsd = draft.domainIcannFeeUsd
  const providerPriceUsd = draft.domainProviderPriceUsd
  const exchangeRate = draft.domainExchangeRate
  const markupPercent = draft.domainMarkupPercent
  const registrationPriceBdt = draft.domainRegistrationPriceBdt
  const quotedAt = draft.domainQuotedAt
  const quoteExpiresAt = draft.domainQuoteExpiresAt

  const isSnapshotInvalid =
    !domain ||
    !extension ||
    registrationYears === null ||
    registrationYears <= 0 ||
    baseRegistrationPriceUsd === null ||
    !Number.isFinite(baseRegistrationPriceUsd) ||
    baseRegistrationPriceUsd <= 0 ||
    icannFeeUsd === null ||
    !Number.isFinite(icannFeeUsd) ||
    icannFeeUsd < 0 ||
    providerPriceUsd === null ||
    !Number.isFinite(providerPriceUsd) ||
    providerPriceUsd <= 0 ||
    exchangeRate === null ||
    !Number.isFinite(exchangeRate) ||
    exchangeRate <= 0 ||
    markupPercent === null ||
    !Number.isFinite(markupPercent) ||
    markupPercent < 0 ||
    registrationPriceBdt === null ||
    !Number.isFinite(registrationPriceBdt) ||
    registrationPriceBdt <= 0 ||
    quotedAt === null ||
    quoteExpiresAt === null ||
    quoteExpiresAt <= quotedAt ||
    quoteExpiresAt <= new Date()

  if (isSnapshotInvalid) {
    await clearCheckoutDraftDomainSelection(draft.id)

    throw new AppError(
      StatusCodes.CONFLICT,
      'Your selected domain is missing or its quote has expired. Please select the domain again.',
      CHECKOUT_ERROR_CODES.DOMAIN_QUOTE_EXPIRED
    )
  }

  return {
    domain,
    extension,
    registrationYears,

    baseRegistrationPriceUsd,
    icannFeeUsd,
    providerPriceUsd,

    exchangeRate,
    markupPercent,
    registrationPriceBdt,
  }
}

const getFreshDomainQuoteOrThrow = async (
  draftId: string,
  domain: string
): Promise<DomainSellingQuote> => {
  try {
    return await DomainQuoteService.getDomainQuoteSnapshot(domain)
  } catch (error) {
    if (error instanceof AppError && error.statusCode === StatusCodes.CONFLICT) {
      await clearCheckoutDraftDomainSelection(draftId)

      throw new AppError(
        StatusCodes.CONFLICT,
        'The selected domain is no longer available or eligible. Please select another domain.',
        CHECKOUT_ERROR_CODES.DOMAIN_UNAVAILABLE
      )
    }

    throw error
  }
}

export const revalidateCheckoutDomainQuote = async (
  vendorId: string,
  draft: CheckoutDraftForPayment
): Promise<DomainSellingQuote> => {
  await ensureVendorCanPurchaseDomain(vendorId, draft.id)

  const savedQuote = await getSavedCheckoutDomainQuoteOrThrow(draft)

  const freshQuote = await getFreshDomainQuoteOrThrow(draft.id, savedQuote.domain)

  // Check 1: domain is no longer purchasable (unavailable or became premium).
  const isDomainUnavailable = !freshQuote.available || freshQuote.isPremium

  if (isDomainUnavailable) {
    await clearCheckoutDraftDomainSelection(draft.id)

    throw new AppError(
      StatusCodes.CONFLICT,
      'The selected domain is no longer available or eligible. Please select another domain.',
      CHECKOUT_ERROR_CODES.DOMAIN_UNAVAILABLE
    )
  }

  // Check 2: domain is still purchasable but the quoted price or details changed.
  const isQuoteDataChanged =
    freshQuote.domain !== savedQuote.domain ||
    freshQuote.extension !== savedQuote.extension ||
    freshQuote.registrationYears !== savedQuote.registrationYears ||
    freshQuote.baseRegistrationPriceUsd !== savedQuote.baseRegistrationPriceUsd ||
    freshQuote.icannFeeUsd !== savedQuote.icannFeeUsd ||
    freshQuote.providerPriceUsd !== savedQuote.providerPriceUsd ||
    freshQuote.exchangeRate !== savedQuote.exchangeRate ||
    freshQuote.markupPercent !== savedQuote.markupPercent ||
    freshQuote.registrationPriceBdt !== savedQuote.registrationPriceBdt

  if (isQuoteDataChanged) {
    await clearCheckoutDraftDomainSelection(draft.id)

    throw new AppError(
      StatusCodes.CONFLICT,
      'The selected domain price or availability has changed. Please select the domain again.',
      CHECKOUT_ERROR_CODES.DOMAIN_QUOTE_CHANGED
    )
  }

  await prisma.vendorCheckoutDraft.update({
    where: {
      id: draft.id,
    },
    data: {
      selectedDomain: freshQuote.domain,
      selectedExtension: freshQuote.extension,
      domainRegistrationYears: freshQuote.registrationYears,

      domainBaseRegistrationPriceUsd: freshQuote.baseRegistrationPriceUsd,

      domainIcannFeeUsd: freshQuote.icannFeeUsd,

      domainProviderPriceUsd: freshQuote.providerPriceUsd,
      domainExchangeRate: freshQuote.exchangeRate,
      domainMarkupPercent: freshQuote.markupPercent,
      domainRegistrationPriceBdt: freshQuote.registrationPriceBdt,
      domainQuotedAt: freshQuote.quotedAt,
      domainQuoteExpiresAt: freshQuote.quoteExpiresAt,
      expiresAt: getCheckoutDraftExpiryTime(),
    },
  })

  return freshQuote
}

export const buildSubscriptionPaymentDomainData = (
  domainQuote: DomainSellingQuote | null
): SubscriptionPaymentDomainData => {
  if (!domainQuote) {
    return {
      isDomainIncluded: false,
      domain: null,
      domainExtension: null,
      domainRegistrationYears: null,
      domainBaseRegistrationPriceUsd: null,
      domainIcannFeeUsd: null,
      domainProviderPriceUsd: null,
      domainExchangeRate: null,
      domainMarkupPercent: null,
      domainRegistrationPriceBdt: null,
      domainQuotedAt: null,
      domainQuoteExpiresAt: null,
    }
  }

  return {
    isDomainIncluded: true,
    domain: domainQuote.domain,
    domainExtension: domainQuote.extension,
    domainRegistrationYears: domainQuote.registrationYears,

    domainBaseRegistrationPriceUsd: domainQuote.baseRegistrationPriceUsd,

    domainIcannFeeUsd: domainQuote.icannFeeUsd,

    domainProviderPriceUsd: domainQuote.providerPriceUsd,
    domainExchangeRate: domainQuote.exchangeRate,
    domainMarkupPercent: domainQuote.markupPercent,
    domainRegistrationPriceBdt: domainQuote.registrationPriceBdt,
    domainQuotedAt: domainQuote.quotedAt,
    domainQuoteExpiresAt: domainQuote.quoteExpiresAt,
  }
}

export const isSameSubscriptionPaymentDomain = (
  payment: SubscriptionPaymentDomainData,
  domainQuote: DomainSellingQuote | null
) => {
  if (!domainQuote) {
    return (
      payment.isDomainIncluded === false &&
      payment.domain === null &&
      payment.domainExtension === null &&
      payment.domainRegistrationYears === null &&
      payment.domainBaseRegistrationPriceUsd === null &&
      payment.domainIcannFeeUsd === null &&
      payment.domainProviderPriceUsd === null &&
      payment.domainExchangeRate === null &&
      payment.domainMarkupPercent === null &&
      payment.domainRegistrationPriceBdt === null &&
      payment.domainQuotedAt === null &&
      payment.domainQuoteExpiresAt === null
    )
  }

  return (
    payment.isDomainIncluded === true &&
    payment.domain === domainQuote.domain &&
    payment.domainExtension === domainQuote.extension &&
    payment.domainRegistrationYears === domainQuote.registrationYears &&
    payment.domainBaseRegistrationPriceUsd === domainQuote.baseRegistrationPriceUsd &&
    payment.domainIcannFeeUsd === domainQuote.icannFeeUsd &&
    payment.domainProviderPriceUsd === domainQuote.providerPriceUsd &&
    payment.domainExchangeRate === domainQuote.exchangeRate &&
    payment.domainMarkupPercent === domainQuote.markupPercent &&
    payment.domainRegistrationPriceBdt === domainQuote.registrationPriceBdt
  )
}
