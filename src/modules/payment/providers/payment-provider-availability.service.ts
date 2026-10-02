import { PaymentMethod } from '@prisma/client'
import { StatusCodes } from 'http-status-codes'

import { PlatformSettingService } from '../../platformSetting/platformSetting.service.js'
import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../../shared/errors/checkoutErrorCodes.js'
import { hasPaymentProvider } from './payment-provider.registry.js'
import type { OnlinePaymentProvider } from './payment-provider.types.js'

export type CustomerPaymentMethod = PaymentMethod | 'MFS'

const getCtaConfig = (pageConfig: unknown): Record<string, unknown> | null => {
  if (!pageConfig || typeof pageConfig !== 'object' || Array.isArray(pageConfig)) {
    return null
  }
  const cta = Reflect.get(pageConfig, 'cta')
  if (!cta || typeof cta !== 'object' || Array.isArray(cta)) {
    return null
  }
  return cta as Record<string, unknown>
}

const isPaymentMethodAllowedByVendor = (
  pageConfig: unknown,
  method: CustomerPaymentMethod
): boolean => {
  const cta = getCtaConfig(pageConfig)

  switch (method) {
    case 'COD':
      // Missing or unconfigured enableCod historically defaults to enabled (preserves legacy storefronts)
      if (!cta || cta['enableCod'] === undefined) {
        return true
      }
      return Boolean(cta['enableCod'])

    case 'SSLCOMMERZ':
      // Online payment methods are strictly opt-in at the vendor level
      if (!cta || cta['enableSslcommerz'] === undefined) {
        return false
      }
      return Boolean(cta['enableSslcommerz'])

    case 'EPS':
      // EPS is strictly opt-in at the vendor level
      if (!cta || cta['enableEps'] === undefined) {
        return false
      }
      return Boolean(cta['enableEps'])

    case 'MFS':
      if (!cta) {
        return false
      }
      if (cta['enableMfs'] !== undefined) {
        return Boolean(cta['enableMfs'])
      }
      return Boolean(cta['bkashNumber'] || cta['rocketNumber'] || cta['nagadNumber'])

    default:
      return false
  }
}

const isPaymentMethodGloballyEnabled = async (
  method: CustomerPaymentMethod
): Promise<boolean> => {
  const settings = await PlatformSettingService.getSettings()

  switch (method) {
    case 'SSLCOMMERZ':
      return settings.enableSsl

    case 'EPS':
      return settings.enableEps

    case 'COD':
      return settings.enableCod

    case 'MFS':
      return settings.enableMfs

    default:
      return false
  }
}

const isPaymentProviderEnabled = async (method: OnlinePaymentProvider): Promise<boolean> => {
  return isPaymentMethodGloballyEnabled(method)
}

const assertPaymentProviderAvailable = async (method: OnlinePaymentProvider) => {
  const isImplemented = hasPaymentProvider(method)

  if (!isImplemented) {
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Payment gateway is currently unavailable',
      CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE
    )
  }

  const isEnabled = await isPaymentProviderEnabled(method)

  if (!isEnabled) {
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Payment gateway is currently unavailable',
      CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE
    )
  }
}

const assertCustomerPaymentMethodAvailable = async (
  vendorId: string,
  method: CustomerPaymentMethod,
  vendorPageConfig?: unknown
): Promise<void> => {
  // Step 1: Admin Global Setting Check (Hard Deny)
  if (method === 'SSLCOMMERZ' || method === 'EPS') {
    const isImplemented = hasPaymentProvider(method)
    if (!isImplemented) {
      throw new AppError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Payment gateway is currently unavailable',
        CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE
      )
    }
  }

  const isGloballyEnabled = await isPaymentMethodGloballyEnabled(method)
  if (!isGloballyEnabled) {
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Payment method is currently unavailable',
      CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE
    )
  }

  // Step 2: Vendor Customer-Facing Setting Check
  let pageConfig = vendorPageConfig
  if (pageConfig === undefined) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { pageConfig: true },
    })

    if (!vendor) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
    }

    pageConfig = vendor.pageConfig
  }

  const isAllowedByVendor = isPaymentMethodAllowedByVendor(pageConfig, method)
  if (!isAllowedByVendor) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Selected payment method is not available for this store',
      CHECKOUT_ERROR_CODES.PAYMENT_METHOD_NOT_ALLOWED_BY_VENDOR
    )
  }
}

export const PaymentProviderAvailabilityService = {
  isPaymentProviderEnabled,
  assertPaymentProviderAvailable,
  isPaymentMethodGloballyEnabled,
  isPaymentMethodAllowedByVendor,
  assertCustomerPaymentMethodAvailable,
}
