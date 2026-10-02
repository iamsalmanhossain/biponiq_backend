import { StatusCodes } from 'http-status-codes'

import AppError from '../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../shared/errors/checkoutErrorCodes.js'
import { PlatformSettingService } from '../../modules/platformSetting/platformSetting.service.js'

export const isManagedDomainPurchaseEnabled = async () => {
  const settings = await PlatformSettingService.getSettings()

  return settings.enableManagedDomainPurchase !== false
}

export const assertManagedDomainPurchaseEnabled = async () => {
  const isEnabled = await isManagedDomainPurchaseEnabled()

  if (isEnabled) {
    return
  }

  throw new AppError(
    StatusCodes.FORBIDDEN,
    'Managed domain purchase is currently unavailable.',
    CHECKOUT_ERROR_CODES.DOMAIN_PURCHASE_DISABLED
  )
}
