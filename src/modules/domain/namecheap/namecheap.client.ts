import { request as httpsRequest } from 'node:https'

import httpStatus from 'http-status'

import { env } from '../../../config/env.js'
import AppError from '../../../shared/errors/AppError.js'
import type {
  NamecheapDnsRecord,
  NamecheapDnsRecordType,
  NamecheapDomainAvailability,
  NamecheapDomainContact,
  NamecheapDomainDnsRecordsResult,
  NamecheapDomainDnsUpdateResult,
  NamecheapDomainInfoResult,
  NamecheapDomainQuote,
  NamecheapDomainRegistrationContacts,
  NamecheapDomainRegistrationInput,
  NamecheapDomainRegistrationResult,
} from '../domain.types.js'
import {
  normalizeDomainExtensions,
  normalizeDomainForQuote,
  normalizeDomainName,
} from '../domain.validation.js'
import { DOMAIN_REGISTRATION_YEARS, type AllowedDomainExtension } from '../domain.constants.js'

// ---------------------------------
// Types
// ---------------------------------

type NamecheapParamValue = string | number | boolean | null | undefined

type NamecheapCommandParams = Record<string, NamecheapParamValue>

type NamecheapProviderError = {
  code: string | null
  message: string
}

type ParsedNamecheapResponse = {
  isSuccess: boolean
  error: NamecheapProviderError | null
}

type NamecheapConfig = {
  baseUrl: string
  apiUser: string
  apiKey: string
  clientIp: string
}

type NamecheapDomainCheckResult = {
  domain: string
  available: boolean
  isPremium: boolean
  icannFeeUsd: number
  eapFee: number
}

type NamecheapRequestMethod = 'GET' | 'POST'

type NamecheapCommandOptions = {
  method?: NamecheapRequestMethod
  useHttp1?: boolean
}

type NamecheapHttp1Response = {
  statusCode: number
  xml: string
}

type NamecheapContactPrefix = 'Registrant' | 'Admin' | 'Tech' | 'AuxBilling'

const NAMECHEAP_REQUEST_TIMEOUT_MS = 15_000

const NAMECHEAP_DNS_RECORD_TYPES = new Set<NamecheapDnsRecordType>([
  'A',
  'AAAA',
  'ALIAS',
  'CAA',
  'CNAME',
  'MX',
  'MXE',
  'NS',
  'TXT',
  'URL',
  'URL301',
  'FRAME',
])

// -----------------------------
// Logic
// -----------------------------

const getNamecheapIcannFeeFallbackUsd = () => {
  const icannFeeFallbackUsd = Number(env.NAMECHEAP_ICANN_FEE_FALLBACK_USD)

  if (!Number.isFinite(icannFeeFallbackUsd) || icannFeeFallbackUsd < 0) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Namecheap ICANN fee fallback is not configured correctly'
    )
  }

  return icannFeeFallbackUsd
}

const getNamecheapConfig = (): NamecheapConfig => {
  const baseUrl = env.NAMECHEAP_API_BASE_URL?.trim()
  const apiUser = env.NAMECHEAP_API_USER?.trim()
  const apiKey = env.NAMECHEAP_API_KEY?.trim()
  const clientIp = env.NAMECHEAP_CLIENT_IP?.trim()

  if (!baseUrl || !apiUser || !apiKey || !clientIp) {
    throw new AppError(httpStatus.SERVICE_UNAVAILABLE, 'Domain provider is not configured')
  }

  try {
    const parsedUrl = new URL(baseUrl)

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }
  } catch {
    throw new AppError(httpStatus.SERVICE_UNAVAILABLE, 'Domain provider configuration is invalid')
  }

  return {
    baseUrl,
    apiUser,
    apiKey,
    clientIp,
  }
}

const parseNamecheapResponse = (xml: string): ParsedNamecheapResponse => {
  const errorMatch = xml.match(/<Error(?:\s+Number="([^"]*)")?[^>]*>([\s\S]*?)<\/Error>/i)

  const error = errorMatch
    ? {
        code: errorMatch[1] ?? null,
        message: errorMatch[2]?.trim() ?? 'Unknown provider error',
      }
    : null

  return {
    isSuccess: /<ApiResponse\b[^>]*\bStatus="OK"/i.test(xml),
    error,
  }
}

const buildNamecheapContactParams = (
  prefix: NamecheapContactPrefix,
  contact: NamecheapDomainContact
): NamecheapCommandParams => {
  const contactParams: NamecheapCommandParams = {
    [`${prefix}FirstName`]: contact.firstName,
    [`${prefix}LastName`]: contact.lastName,
    [`${prefix}Address1`]: contact.address1,
    [`${prefix}City`]: contact.city,
    [`${prefix}StateProvince`]: contact.stateProvince,
    [`${prefix}PostalCode`]: contact.postalCode,
    [`${prefix}Country`]: contact.country,
    [`${prefix}Phone`]: contact.phone,
    [`${prefix}EmailAddress`]: contact.emailAddress,
  }

  if (contact.organizationName) {
    contactParams[`${prefix}OrganizationName`] = contact.organizationName
  }

  return contactParams
}

const buildNamecheapRegistrationContactParams = (
  contacts: NamecheapDomainRegistrationContacts
): NamecheapCommandParams => {
  return {
    ...buildNamecheapContactParams('Registrant', contacts.registrant),

    ...buildNamecheapContactParams('Admin', contacts.admin),

    ...buildNamecheapContactParams('Tech', contacts.tech),

    ...buildNamecheapContactParams('AuxBilling', contacts.auxBilling),
  }
}

const getSafeNamecheapError = ({
  responseOk,
  parsedResponse,
}: {
  responseOk: boolean
  parsedResponse: ParsedNamecheapResponse
}) => {
  if (!responseOk) {
    return new AppError(httpStatus.BAD_GATEWAY, 'Domain provider is temporarily unavailable')
  }

  if (parsedResponse.error) {
    return new AppError(httpStatus.BAD_REQUEST, 'Domain provider rejected the request')
  }

  return new AppError(httpStatus.BAD_GATEWAY, 'Domain provider returned an invalid response')
}

const getXmlAttribute = (attributes: string, attributeName: string) => {
  const attributePattern = new RegExp(`\\b${attributeName}="([^"]*)"`, 'i')

  return attributes.match(attributePattern)?.[1] ?? null
}

const decodeXmlValue = (value: string) => {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hexValue: string) => {
      return String.fromCodePoint(Number.parseInt(hexValue, 16))
    })
    .replace(/&#(\d+);/g, (_, decimalValue: string) => {
      return String.fromCodePoint(Number.parseInt(decimalValue, 10))
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const parseCurrencyAmount = (value: string | null) => {
  if (!value) {
    return null
  }

  const amount = Number(value)

  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  return amount
}

const parseXmlBoolean = (value: string | null) => {
  if (!value) {
    return null
  }

  const normalizedValue = value.toLowerCase()

  if (normalizedValue === 'true') {
    return true
  }

  if (normalizedValue === 'false') {
    return false
  }

  return null
}

const parseDnsInteger = (value: string | null) => {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return null
  }

  return parsedValue
}

const parseNamecheapDnsRecordType = (value: string | null): NamecheapDnsRecordType | null => {
  const normalizedType = value?.trim().toUpperCase()

  if (
    !normalizedType ||
    !NAMECHEAP_DNS_RECORD_TYPES.has(normalizedType as NamecheapDnsRecordType)
  ) {
    return null
  }

  return normalizedType as NamecheapDnsRecordType
}

const getNamecheapDomainParts = (requestedDomain: string) => {
  const { domain, extension } = normalizeDomainForQuote(requestedDomain)

  const sld = domain.slice(0, -extension.length)

  const tld = extension.slice(1)

  if (!sld || !tld) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Purchased domain format is invalid')
  }

  return {
    domain,
    sld,
    tld,
  }
}

const buildNamecheapDnsRecordParams = (records: NamecheapDnsRecord[]): NamecheapCommandParams => {
  if (records.length === 0) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'At least one DNS record is required')
  }

  const params: NamecheapCommandParams = {}

  records.forEach((record, index) => {
    const name = record.name.trim()
    const address = record.address.trim()

    if (!name || !address) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'DNS record data is incomplete')
    }

    if (!Number.isInteger(record.ttl) || record.ttl < 60 || record.ttl > 60_000) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'DNS record TTL is invalid')
    }

    if (record.type === 'MX' && record.mxPreference === null) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'MX record preference is missing')
    }

    const recordNumber = index + 1

    params[`HostName${recordNumber}`] = name

    params[`RecordType${recordNumber}`] = record.type

    params[`Address${recordNumber}`] = address

    params[`TTL${recordNumber}`] = record.ttl

    if (record.type === 'MX' && record.mxPreference !== null) {
      params[`MXPref${recordNumber}`] = record.mxPreference
    }
  })

  return params
}

const parseNamecheapDnsRecord = (attributes: string): NamecheapDnsRecord => {
  const nameValue = getXmlAttribute(attributes, 'Name')

  const type = parseNamecheapDnsRecordType(getXmlAttribute(attributes, 'Type'))

  const addressValue = getXmlAttribute(attributes, 'Address')

  const ttl = parseDnsInteger(getXmlAttribute(attributes, 'TTL'))

  if (nameValue === null || !type || addressValue === null || ttl === null || ttl <= 0) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Domain provider returned an incomplete DNS record')
  }

  const mxPreferenceValue = parseDnsInteger(getXmlAttribute(attributes, 'MXPref'))

  const requiresMxPreference = type === 'MX' || type === 'MXE'

  if (requiresMxPreference && mxPreferenceValue === null) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Domain provider returned an incomplete MX record')
  }

  return {
    name: decodeXmlValue(nameValue),
    type,
    address: decodeXmlValue(addressValue),

    mxPreference: requiresMxPreference ? mxPreferenceValue : null,

    ttl,
  }
}

const getNamecheapDomainDnsRecordsResult = (
  xml: string,
  requestedDomain: string
): NamecheapDomainDnsRecordsResult => {
  const resultMatch = xml.match(
    /<DomainDNSGetHostsResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/DomainDNSGetHostsResult>)/i
  )

  if (!resultMatch) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete DNS response'
    )
  }

  const resultAttributes = resultMatch[1] ?? ''

  const resultBody = resultMatch[2] ?? ''

  const domainValue = getXmlAttribute(resultAttributes, 'Domain')

  const isUsingNamecheapDns = parseXmlBoolean(getXmlAttribute(resultAttributes, 'IsUsingOurDNS'))

  const normalizedResultDomain = domainValue ? decodeXmlValue(domainValue).toLowerCase() : null

  if (normalizedResultDomain !== requestedDomain || isUsingNamecheapDns === null) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Domain provider returned invalid DNS information')
  }

  const recordMatches = Array.from(resultBody.matchAll(/<Host\b([^>]*)\/?>/gi))

  const records = recordMatches.map((recordMatch) => {
    return parseNamecheapDnsRecord(recordMatch[1] ?? '')
  })

  return {
    domain: requestedDomain,
    isUsingNamecheapDns,
    records,
  }
}

const getNamecheapDomainDnsUpdateResult = (
  xml: string,
  requestedDomain: string
): NamecheapDomainDnsUpdateResult => {
  const resultMatch = xml.match(/<DomainDNSSetHostsResult\b([^>]*)\/?>/i)

  if (!resultMatch) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete DNS update response'
    )
  }

  const attributes = resultMatch[1] ?? ''

  const domainValue = getXmlAttribute(attributes, 'Domain')

  const isSuccess = parseXmlBoolean(getXmlAttribute(attributes, 'IsSuccess'))

  const resultDomain = domainValue ? decodeXmlValue(domainValue).toLowerCase() : null

  if (resultDomain !== requestedDomain || isSuccess === null) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned invalid DNS update information'
    )
  }

  if (!isSuccess) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Domain provider did not update DNS records')
  }

  return {
    domain: requestedDomain,
    updated: true,
  }
}

const parseNamecheapDate = (value: string | null) => {
  if (!value) {
    return null
  }

  const dateMatch = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (!dateMatch) {
    return null
  }

  const month = Number(dateMatch[1])
  const day = Number(dateMatch[2])
  const year = Number(dateMatch[3])

  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  const isValidDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day

  if (!isValidDate) {
    return null
  }

  return parsedDate
}

const getNamecheapDomainCheckResult = (
  xml: string,
  requestedDomain: string
): NamecheapDomainCheckResult => {
  const domainCheckResults = Array.from(xml.matchAll(/<DomainCheckResult\b([^>]*)\/?>/gi))

  const matchingResult = domainCheckResults.find((match) => {
    const attributes = match[1] ?? ''
    const domain = getXmlAttribute(attributes, 'Domain')

    return domain?.toLowerCase() === requestedDomain
  })

  if (!matchingResult) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete availability response'
    )
  }

  const attributes = matchingResult[1] ?? ''
  const available = getXmlAttribute(attributes, 'Available')
  const isPremiumName = getXmlAttribute(attributes, 'IsPremiumName')

  if (!available || !isPremiumName) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete availability response'
    )
  }

  const icannFeeUsd = parseCurrencyAmount(getXmlAttribute(attributes, 'IcannFee')) ?? 0

  if (icannFeeUsd === null) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete ICANN fee response'
    )
  }

  const eapFee = parseCurrencyAmount(getXmlAttribute(attributes, 'EapFee')) ?? 0

  return {
    domain: requestedDomain,
    available: available.toLowerCase() === 'true',
    isPremium: isPremiumName.toLowerCase() === 'true',
    icannFeeUsd,
    eapFee,
  }
}

const getNamecheapDomainRegistrationResult = (
  xml: string,
  requestedDomain: string
): NamecheapDomainRegistrationResult => {
  const resultMatch = xml.match(/<DomainCreateResult\b([^>]*)\/?>/i)

  if (!resultMatch) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete registration response'
    )
  }

  const attributes = resultMatch[1] ?? ''

  const domain = getXmlAttribute(attributes, 'Domain')
  const registered = parseXmlBoolean(getXmlAttribute(attributes, 'Registered'))

  const chargedAmountUsd = parseCurrencyAmount(getXmlAttribute(attributes, 'ChargedAmount'))

  const providerDomainId = getXmlAttribute(attributes, 'DomainID')

  const providerOrderId = getXmlAttribute(attributes, 'OrderID')

  const providerTransactionId = getXmlAttribute(attributes, 'TransactionID')

  const isNonRealTimeDomain = parseXmlBoolean(getXmlAttribute(attributes, 'NonRealTimeDomain'))

  if (
    domain?.toLowerCase() !== requestedDomain ||
    registered === null ||
    chargedAmountUsd === null ||
    !providerDomainId ||
    !providerOrderId ||
    !providerTransactionId ||
    isNonRealTimeDomain === null
  ) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete registration response'
    )
  }

  if (!registered) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Domain provider did not complete registration')
  }

  return {
    domain: requestedDomain,
    registered: true,
    chargedAmountUsd,
    providerDomainId,
    providerOrderId,
    providerTransactionId,
    isRealTime: !isNonRealTimeDomain,
  }
}

const getNamecheapDomainInfoResult = (
  xml: string,
  requestedDomain: string
): NamecheapDomainInfoResult => {
  const resultMatch = xml.match(/<DomainGetInfoResult\b([^>]*)>([\s\S]*?)<\/DomainGetInfoResult>/i)

  if (!resultMatch) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete domain information response'
    )
  }

  const attributes = resultMatch[1] ?? ''
  const resultXml = resultMatch[2] ?? ''

  const domain = getXmlAttribute(attributes, 'DomainName')

  const domainDetailsMatch = resultXml.match(/<DomainDetails\b[^>]*>([\s\S]*?)<\/DomainDetails>/i)

  const domainDetailsXml = domainDetailsMatch?.[1] ?? ''

  const expiredDateMatch = domainDetailsXml.match(/<ExpiredDate>([^<]+)<\/ExpiredDate>/i)

  const expiresAt = parseNamecheapDate(expiredDateMatch?.[1] ?? null)

  if (domain?.toLowerCase() !== requestedDomain || !expiresAt) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider returned an incomplete domain information response'
    )
  }

  return {
    domain: requestedDomain,
    expiresAt,
  }
}

const getNamecheapRegistrationPrice = async (
  extension: AllowedDomainExtension,
  registrationYears: number
) => {
  const productName = extension.slice(1).toUpperCase()

  const { xml } = await runNamecheapCommand('namecheap.users.getPricing', {
    ProductType: 'DOMAIN',
    ProductCategory: 'DOMAINS',
    ActionName: 'REGISTER',
    ProductName: productName,
  })

  const productPattern = new RegExp(
    `<Product\\b(?=[^>]*\\bName="${productName}"[^>]*)[^>]*>([\\s\\S]*?)<\\/Product>`,
    'i'
  )

  const productMatch = xml.match(productPattern)
  const productXml = productMatch?.[1]

  if (!productXml) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider did not return registration pricing'
    )
  }

  const priceAttributes = Array.from(productXml.matchAll(/<Price\b([^>]*)\/?>/gi))
    .map((match) => match[1] ?? '')
    .find(
      (attributes) =>
        getXmlAttribute(attributes, 'Duration') === String(registrationYears) &&
        getXmlAttribute(attributes, 'DurationType')?.toUpperCase() === 'YEAR'
    )

  const providerPriceUsd = parseCurrencyAmount(
    priceAttributes ? getXmlAttribute(priceAttributes, 'Price') : null
  )

  const currency = priceAttributes ? getXmlAttribute(priceAttributes, 'Currency') : null

  if (providerPriceUsd === null || currency?.toUpperCase() !== 'USD') {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Domain provider did not return valid USD registration pricing'
    )
  }

  return providerPriceUsd
}

const parseDomainAvailabilityResults = (xml: string) => {
  return Array.from(xml.matchAll(/<DomainCheckResult\b([^>]*)\/?>/gi)).map((match) => {
    const attributes = match[1]

    if (!attributes) {
      return null
    }

    const domain = getXmlAttribute(attributes, 'Domain')
    const available = getXmlAttribute(attributes, 'Available')

    if (!domain || !available) {
      return null
    }

    return {
      domain: domain.toLowerCase(),
      available: available.toLowerCase() === 'true',
    }
  })
}

const runNamecheapHttp1Request = (
  url: URL,
  method: NamecheapRequestMethod,
  requestBody: string | null
): Promise<NamecheapHttp1Response> => {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      Accept: 'application/xml',
      Connection: 'close',
    }

    if (requestBody !== null) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'

      headers['Content-Length'] = Buffer.byteLength(requestBody)
    }

    const request = httpsRequest(
      url,
      {
        method,
        headers,

        // One request, one HTTP/1.1 connection.
        // No automatic retry or connection reuse.
        agent: false,
      },
      (response) => {
        let xml = ''

        response.setEncoding('utf8')

        response.on('data', (chunk: string) => {
          xml += chunk
        })

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,

            xml,
          })
        })
      }
    )

    request.setTimeout(NAMECHEAP_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Namecheap HTTP/1.1 request timed out'))
    })

    request.on('error', reject)

    if (requestBody !== null) {
      request.write(requestBody)
    }

    request.end()
  })
}

export const runNamecheapCommand = async (
  command: string,
  params: NamecheapCommandParams = {},
  options: NamecheapCommandOptions = {}
) => {
  const config = getNamecheapConfig()

  const requestParams = new URLSearchParams()

  requestParams.set('ApiUser', config.apiUser)
  requestParams.set('ApiKey', config.apiKey)
  requestParams.set('UserName', config.apiUser)
  requestParams.set('ClientIp', config.clientIp)
  requestParams.set('Command', command)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      requestParams.set(key, String(value))
    }
  })

  const method = options.method ?? 'GET'

  const url = new URL(config.baseUrl)

  const requestBody = method === 'POST' ? requestParams.toString() : null

  if (method === 'GET') {
    url.search = requestParams.toString()
  }

  let responseOk: boolean
  let xml: string

  try {
    if (options.useHttp1) {
      const response = await runNamecheapHttp1Request(url, method, requestBody)

      responseOk = response.statusCode >= 200 && response.statusCode < 300

      xml = response.xml
    } else {
      const requestOptions: RequestInit = {
        method,
        headers: {
          Accept: 'application/xml',
        },
        signal: AbortSignal.timeout(NAMECHEAP_REQUEST_TIMEOUT_MS),
      }

      if (requestBody !== null) {
        requestOptions.headers = {
          ...requestOptions.headers,

          'Content-Type': 'application/x-www-form-urlencoded',
        }

        requestOptions.body = requestBody
      }

      const response = await fetch(url, requestOptions)

      responseOk = response.ok

      xml = await response.text()
    }
  } catch {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Domain provider is temporarily unavailable')
  }

  const parsedResponse = parseNamecheapResponse(xml)

  if (!responseOk || !parsedResponse.isSuccess || parsedResponse.error) {
    throw getSafeNamecheapError({
      responseOk,
      parsedResponse,
    })
  }

  // Internal server-side use only.
  // Never return this raw XML from a controller.
  return {
    xml,
  }
}

export const checkNamecheapDomainAvailability = async (
  domainName: string,
  extensions: string[]
): Promise<NamecheapDomainAvailability[]> => {
  const normalizedDomainName = normalizeDomainName(domainName)
  const normalizedExtensions = normalizeDomainExtensions(extensions)

  const requestedDomains = normalizedExtensions.map(
    (extension) => `${normalizedDomainName}${extension}`
  )

  const { xml } = await runNamecheapCommand('namecheap.domains.check', {
    DomainList: requestedDomains.join(','),
  })

  const providerResults = parseDomainAvailabilityResults(xml)

  const availabilityByDomain = new Map<string, boolean>(
    providerResults
      .filter((result): result is { domain: string; available: boolean } => result !== null)
      .map((result) => [result.domain, result.available])
  )

  return requestedDomains.map<NamecheapDomainAvailability>((domain, index) => {
    const extension = normalizedExtensions[index]
    const available = availabilityByDomain.get(domain)

    if (!extension || available === undefined) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        'Domain provider returned an incomplete availability response'
      )
    }

    return {
      domain,
      extension,
      available,
    }
  })
}

export const getNamecheapDomainQuote = async (
  requestedDomain: string
): Promise<NamecheapDomainQuote> => {
  const { domain, extension } = normalizeDomainForQuote(requestedDomain)

  const { xml } = await runNamecheapCommand('namecheap.domains.check', {
    DomainList: domain,
  })

  const availabilityResult = getNamecheapDomainCheckResult(xml, domain)

  if (!availabilityResult.available) {
    throw new AppError(httpStatus.CONFLICT, 'Domain is not available')
  }

  if (availabilityResult.eapFee > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This domain has an additional early-access fee and is not supported'
    )
  }

  if (availabilityResult.isPremium) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Premium domains are not supported')
  }

  const baseRegistrationPriceUsd = await getNamecheapRegistrationPrice(
    extension,
    DOMAIN_REGISTRATION_YEARS
  )

  const providerIcannFeeUsd = availabilityResult.icannFeeUsd

  const icannFeeUsd =
    providerIcannFeeUsd > 0 ? providerIcannFeeUsd : getNamecheapIcannFeeFallbackUsd()

  const providerPriceUsd = Number((baseRegistrationPriceUsd + icannFeeUsd).toFixed(4))

  return {
    domain,
    extension,
    available: true,
    registrationYears: DOMAIN_REGISTRATION_YEARS,

    baseRegistrationPriceUsd,
    icannFeeUsd,
    providerPriceUsd,

    isPremium: false,
  }
}

export const registerNamecheapDomain = async (
  input: NamecheapDomainRegistrationInput
): Promise<NamecheapDomainRegistrationResult> => {
  const { domain } = normalizeDomainForQuote(input.domain)

  if (input.registrationYears !== DOMAIN_REGISTRATION_YEARS) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Unsupported domain registration period')
  }

  const contactParams = buildNamecheapRegistrationContactParams(input.contacts)

  const { xml } = await runNamecheapCommand(
    'namecheap.domains.create',
    {
      DomainName: domain,
      Years: input.registrationYears,

      ...contactParams,

      AddFreeWhoisguard: 'no',
      WGEnabled: 'no',
    },
    {
      method: 'POST',
    }
  )

  return getNamecheapDomainRegistrationResult(xml, domain)
}

export const getNamecheapDomainDnsRecords = async (
  requestedDomain: string
): Promise<NamecheapDomainDnsRecordsResult> => {
  const { domain, sld, tld } = getNamecheapDomainParts(requestedDomain)

  const { xml } = await runNamecheapCommand(
    'namecheap.domains.dns.getHosts',
    {
      SLD: sld,
      TLD: tld,
    },
    {
      useHttp1: true,
    }
  )

  return getNamecheapDomainDnsRecordsResult(xml, domain)
}

export const setNamecheapDomainDnsRecords = async (
  requestedDomain: string,
  records: NamecheapDnsRecord[]
): Promise<NamecheapDomainDnsUpdateResult> => {
  const { domain, sld, tld } = getNamecheapDomainParts(requestedDomain)

  const dnsRecordParams = buildNamecheapDnsRecordParams(records)

  const { xml } = await runNamecheapCommand(
    'namecheap.domains.dns.setHosts',
    {
      SLD: sld,
      TLD: tld,

      ...dnsRecordParams,
    },
    {
      method: 'POST',
      useHttp1: true,
    }
  )

  return getNamecheapDomainDnsUpdateResult(xml, domain)
}

export const getNamecheapDomainInfo = async (
  requestedDomain: string
): Promise<NamecheapDomainInfoResult> => {
  const { domain } = normalizeDomainForQuote(requestedDomain)

  const { xml } = await runNamecheapCommand('namecheap.domains.getInfo', {
    DomainName: domain,
  })

  return getNamecheapDomainInfoResult(xml, domain)
}

export const verifyNamecheapSandboxConnection = async () => {
  await runNamecheapCommand('namecheap.users.getBalances')

  return {
    message: 'Namecheap Sandbox connection verified successfully.',
  }
}
