import httpStatus from 'http-status'

import { env } from '../../../config/env.js'
import AppError from '../../../shared/errors/AppError.js'

import type { NamecheapDomainContact } from '../domain.types.js'

const getRequiredContactValue = (value: string | undefined, fieldName: string) => {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Missing Namecheap registration contact configuration: ${fieldName}`
    )
  }

  return normalizedValue
}

export const getNamecheapRegistrationContact = (): NamecheapDomainContact => {
  const organizationName = env.NAMECHEAP_CONTACT_ORGANIZATION_NAME?.trim()

  return {
    firstName: getRequiredContactValue(
      env.NAMECHEAP_CONTACT_FIRST_NAME,
      'NAMECHEAP_CONTACT_FIRST_NAME'
    ),

    lastName: getRequiredContactValue(
      env.NAMECHEAP_CONTACT_LAST_NAME,
      'NAMECHEAP_CONTACT_LAST_NAME'
    ),

    address1: getRequiredContactValue(env.NAMECHEAP_CONTACT_ADDRESS1, 'NAMECHEAP_CONTACT_ADDRESS1'),

    city: getRequiredContactValue(env.NAMECHEAP_CONTACT_CITY, 'NAMECHEAP_CONTACT_CITY'),

    stateProvince: getRequiredContactValue(
      env.NAMECHEAP_CONTACT_STATE_PROVINCE,
      'NAMECHEAP_CONTACT_STATE_PROVINCE'
    ),

    postalCode: getRequiredContactValue(
      env.NAMECHEAP_CONTACT_POSTAL_CODE,
      'NAMECHEAP_CONTACT_POSTAL_CODE'
    ),

    country: getRequiredContactValue(env.NAMECHEAP_CONTACT_COUNTRY, 'NAMECHEAP_CONTACT_COUNTRY'),

    phone: getRequiredContactValue(env.NAMECHEAP_CONTACT_PHONE, 'NAMECHEAP_CONTACT_PHONE'),

    emailAddress: getRequiredContactValue(env.NAMECHEAP_CONTACT_EMAIL, 'NAMECHEAP_CONTACT_EMAIL'),

    ...(organizationName
      ? {
          organizationName,
        }
      : {}),
  }
}
