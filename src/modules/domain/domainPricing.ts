import httpStatus from 'http-status'

import { env } from '../../config/env.js'
import AppError from '../../shared/errors/AppError.js'
import { DomainSellingPrice } from './domain.types.js'

type DomainPricingConfig = {
  usdToBdtRate: number
  markupPercent: number
  quoteTtlMinutes: number
}

const throwInvalidDomainPricingConfig = () => {
  throw new AppError(httpStatus.SERVICE_UNAVAILABLE, 'Domain pricing is not configured correctly')
}

const parsePositiveNumber = (value: string | undefined) => {
  const parsedValue = Number(value)

  if (!value?.trim() || !Number.isFinite(parsedValue) || parsedValue <= 0) {
    throwInvalidDomainPricingConfig()
  }

  return parsedValue
}

const parseNonNegativeNumber = (value: string | undefined) => {
  const parsedValue = Number(value)

  if (!value?.trim() || !Number.isFinite(parsedValue) || parsedValue < 0) {
    throwInvalidDomainPricingConfig()
  }

  return parsedValue
}

const parsePositiveInteger = (value: string | undefined) => {
  const parsedValue = Number(value)

  if (!value?.trim() || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    throwInvalidDomainPricingConfig()
  }

  return parsedValue
}

export const getDomainPricingConfig = (): DomainPricingConfig => {
  return {
    usdToBdtRate: parsePositiveNumber(env.DOMAIN_USD_TO_BDT_RATE),
    markupPercent: parseNonNegativeNumber(env.DOMAIN_MARKUP_PERCENT),
    quoteTtlMinutes: parsePositiveInteger(env.DOMAIN_QUOTE_TTL_MINUTES),
  }
}

export const calculateDomainSellingPrice = (providerPriceUsd: number): DomainSellingPrice => {
  if (!Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned invalid registration pricing'
    )
  }

  const { usdToBdtRate, markupPercent } = getDomainPricingConfig()

  const providerPriceBdt = providerPriceUsd * usdToBdtRate
  const markupAmountBdt = providerPriceBdt * (markupPercent / 100)

  const registrationPriceBdt = Math.ceil(providerPriceBdt + markupAmountBdt)

  return {
    providerPriceUsd,
    exchangeRate: usdToBdtRate,
    markupPercent,
    registrationPriceBdt,
  }
}
