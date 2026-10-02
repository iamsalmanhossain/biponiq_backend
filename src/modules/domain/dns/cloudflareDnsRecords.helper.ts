import httpStatus from 'http-status'

import AppError from '../../../shared/errors/AppError.js'

import type {
  CloudflareCustomHostnameResult,
  CloudflareSslValidationRecord,
} from '../cloudflare/cloudflareCustomHostname.types.js'

import type { NamecheapDnsRecord } from '../domain.types.js'

const DNS_TTL_SECONDS = 300

const normalizeDnsName = (value: string) => {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

const getValidatedRoutingTarget = (requestedTarget: string) => {
  const routingTarget = normalizeDnsName(requestedTarget)

  if (!routingTarget) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cloudflare SaaS routing target is missing'
    )
  }

  try {
    const parsedTarget = new URL(`https://${routingTarget}`)

    const isValidHostname =
      parsedTarget.hostname === routingTarget &&
      parsedTarget.pathname === '/' &&
      !parsedTarget.port &&
      !parsedTarget.search &&
      !parsedTarget.hash

    if (!isValidHostname) {
      throw new Error('Invalid routing target')
    }
  } catch {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cloudflare SaaS routing target is invalid'
    )
  }

  return routingTarget
}

const getNamecheapRecordName = ({ recordName, domain }: { recordName: string; domain: string }) => {
  const normalizedRecordName = normalizeDnsName(recordName)

  const normalizedDomain = normalizeDnsName(domain)

  if (normalizedRecordName === normalizedDomain) {
    return '@'
  }

  const domainSuffix = `.${normalizedDomain}`

  if (!normalizedRecordName.endsWith(domainSuffix)) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Cloudflare returned a DNS record for another domain'
    )
  }

  const relativeRecordName = normalizedRecordName.slice(0, -domainSuffix.length)

  if (!relativeRecordName) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Cloudflare returned an invalid DNS record name')
  }

  return relativeRecordName
}

const createNamecheapDnsRecord = ({
  name,
  type,
  address,
}: {
  name: string
  type: 'ALIAS' | 'CNAME' | 'TXT'
  address: string
}): NamecheapDnsRecord => {
  const normalizedName = name.trim()

  const normalizedAddress = address.trim()

  if (!normalizedName || !normalizedAddress) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Cloudflare returned an incomplete DNS record')
  }

  return {
    name: normalizedName,
    type,
    address: normalizedAddress,
    mxPreference: null,
    ttl: DNS_TTL_SECONDS,
  }
}

const getSslValidationDnsRecord = ({
  domain,
  validationRecord,
}: {
  domain: string
  validationRecord: CloudflareSslValidationRecord
}): NamecheapDnsRecord | null => {
  if (validationRecord.txtName && validationRecord.txtValue) {
    return createNamecheapDnsRecord({
      name: getNamecheapRecordName({
        recordName: validationRecord.txtName,
        domain,
      }),
      type: 'TXT',
      address: validationRecord.txtValue,
    })
  }

  if (validationRecord.cname && validationRecord.cnameTarget) {
    return createNamecheapDnsRecord({
      name: getNamecheapRecordName({
        recordName: validationRecord.cname,
        domain,
      }),
      type: 'CNAME',
      address: validationRecord.cnameTarget,
    })
  }

  return null
}

export const buildPurchasedDomainRequiredDnsRecords = ({
  domain,
  routingTarget,
  cloudflareHostname,
}: {
  domain: string
  routingTarget: string
  cloudflareHostname: CloudflareCustomHostnameResult
}): NamecheapDnsRecord[] => {
  const normalizedDomain = normalizeDnsName(domain)

  if (!normalizedDomain || cloudflareHostname.hostname !== normalizedDomain) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cloudflare hostname does not match the purchased domain'
    )
  }

  const validatedRoutingTarget = getValidatedRoutingTarget(routingTarget)

  const requiredRecords: NamecheapDnsRecord[] = [
    createNamecheapDnsRecord({
      name: '@',
      type: 'ALIAS',
      address: validatedRoutingTarget,
    }),
  ]

  const ownershipVerification = cloudflareHostname.ownershipVerification

  if (ownershipVerification) {
    requiredRecords.push(
      createNamecheapDnsRecord({
        name: getNamecheapRecordName({
          recordName: ownershipVerification.name,
          domain: normalizedDomain,
        }),
        type: 'TXT',
        address: ownershipVerification.value,
      })
    )
  } else if (cloudflareHostname.status !== 'active') {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Cloudflare hostname verification record is not ready'
    )
  }

  const sslValidationRecords = cloudflareHostname.sslValidationRecords
    .map((validationRecord) => {
      return getSslValidationDnsRecord({
        domain: normalizedDomain,
        validationRecord,
      })
    })
    .filter((record): record is NamecheapDnsRecord => {
      return record !== null
    })

  if (sslValidationRecords.length === 0 && cloudflareHostname.sslStatus !== 'active') {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Cloudflare SSL validation records are not ready')
  }

  requiredRecords.push(...sslValidationRecords)

  return requiredRecords
}
