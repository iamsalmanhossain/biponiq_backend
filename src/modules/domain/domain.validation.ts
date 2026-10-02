import httpStatus from 'http-status'

import AppError from '../../shared/errors/AppError.js'
import { ALLOWED_DOMAIN_EXTENSIONS, type AllowedDomainExtension } from './domain.constants.js'

const DOMAIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export const normalizeDomainName = (domainName: string) => {
  const normalizedDomainName = domainName.trim().toLowerCase()

  if (!DOMAIN_NAME_PATTERN.test(normalizedDomainName)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Domain name may contain only letters, numbers, and hyphens'
    )
  }

  return normalizedDomainName
}

export const normalizeDomainExtensions = (extensions: string[]): AllowedDomainExtension[] => {
  if (extensions.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Select at least one domain extension')
  }

  const normalizedExtensions = [
    ...new Set(extensions.map((extension) => extension.trim().toLowerCase())),
  ]

  const unsupportedExtension = normalizedExtensions.find(
    (extension) => !ALLOWED_DOMAIN_EXTENSIONS.includes(extension as AllowedDomainExtension)
  )

  if (unsupportedExtension) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'One or more selected domain extensions are not supported'
    )
  }

  return normalizedExtensions as AllowedDomainExtension[]
}

export const normalizeDomainForQuote = (domain: string) => {
  const normalizedDomain = domain.trim().toLowerCase()

  const extension = ALLOWED_DOMAIN_EXTENSIONS.find((allowedExtension) =>
    normalizedDomain.endsWith(allowedExtension)
  )

  if (!extension) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Domain extension is not supported')
  }

  const domainName = normalizedDomain.slice(0, -extension.length)
  const normalizedDomainName = normalizeDomainName(domainName)

  return {
    domain: `${normalizedDomainName}${extension}`,
    extension,
  }
}
