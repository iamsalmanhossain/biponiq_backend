import { assertManagedDomainPurchaseEnabled } from '../../../shared/errors/managedDomainPurchase.guard.js'
import type { DomainSellingQuote, VendorDomainQuote } from '../domain.types.js'
import { calculateDomainSellingPrice, getDomainPricingConfig } from '../domainPricing.js'
import { getNamecheapDomainQuote } from '../namecheap/namecheap.client.js'

const getDomainQuoteSnapshot = async (requestedDomain: string): Promise<DomainSellingQuote> => {
  const providerQuote = await getNamecheapDomainQuote(requestedDomain)

  const sellingPrice = calculateDomainSellingPrice(providerQuote.providerPriceUsd)

  const { quoteTtlMinutes } = getDomainPricingConfig()

  const quotedAt = new Date()

  const quoteExpiresAt = new Date(quotedAt.getTime() + quoteTtlMinutes * 60 * 1000)

  return {
    domain: providerQuote.domain,
    extension: providerQuote.extension,
    available: providerQuote.available,
    registrationYears: providerQuote.registrationYears,

    baseRegistrationPriceUsd: providerQuote.baseRegistrationPriceUsd,

    icannFeeUsd: providerQuote.icannFeeUsd,

    providerPriceUsd: sellingPrice.providerPriceUsd,

    exchangeRate: sellingPrice.exchangeRate,

    markupPercent: sellingPrice.markupPercent,

    registrationPriceBdt: sellingPrice.registrationPriceBdt,

    isPremium: providerQuote.isPremium,

    quotedAt,
    quoteExpiresAt,
  }
}

const getVendorDomainQuote = async (requestedDomain: string): Promise<VendorDomainQuote> => {
  await assertManagedDomainPurchaseEnabled()

  const quote = await getDomainQuoteSnapshot(requestedDomain)

  return {
    domain: quote.domain,
    extension: quote.extension,
    available: quote.available,
    registrationYears: quote.registrationYears,
    registrationPriceBdt: quote.registrationPriceBdt,
    isPremium: quote.isPremium,
    quotedAt: quote.quotedAt,
    quoteExpiresAt: quote.quoteExpiresAt,
  }
}

export const DomainQuoteService = {
  getDomainQuoteSnapshot,
  getVendorDomainQuote,
}
