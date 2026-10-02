import httpStatus from 'http-status'

import AppError from '../../../shared/errors/AppError.js'

import type { NamecheapDnsRecord, NamecheapDnsRecordType } from '../domain.types.js'

const NAMECHEAP_PARKING_TARGET = 'parkingpage.namecheap.com'

const ROUTING_RECORD_TYPES = new Set<NamecheapDnsRecordType>([
  'A',
  'AAAA',
  'ALIAS',
  'CNAME',
  'URL',
  'URL301',
  'FRAME',
])

const normalizeRecordName = (value: string) => {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

const normalizeDomainAddress = (value: string) => {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

const normalizeAddressForComparison = (record: NamecheapDnsRecord) => {
  const domainAddressTypes = new Set<NamecheapDnsRecordType>(['ALIAS', 'CNAME', 'MX', 'MXE', 'NS'])

  if (domainAddressTypes.has(record.type)) {
    return normalizeDomainAddress(record.address)
  }

  return record.address.trim()
}

const isNamecheapParkingRedirect = (record: NamecheapDnsRecord, domain: string) => {
  const recordName = normalizeRecordName(record.name)

  if (recordName !== '@' || (record.type !== 'URL' && record.type !== 'URL301')) {
    return false
  }

  try {
    const redirectUrl = new URL(record.address)

    return (
      redirectUrl.hostname.toLowerCase() === `www.${domain}` &&
      redirectUrl.searchParams.get('from') === '@'
    )
  } catch {
    return false
  }
}

const isNamecheapParkingRecord = (record: NamecheapDnsRecord, domain: string) => {
  const recordName = normalizeRecordName(record.name)

  const recordAddress = normalizeAddressForComparison(record)

  const isParkingCname =
    recordName === 'www' && record.type === 'CNAME' && recordAddress === NAMECHEAP_PARKING_TARGET

  return isParkingCname || isNamecheapParkingRedirect(record, domain)
}

const recordsConflict = (
  existingRecord: NamecheapDnsRecord,
  requiredRecord: NamecheapDnsRecord
) => {
  const existingName = normalizeRecordName(existingRecord.name)

  const requiredName = normalizeRecordName(requiredRecord.name)

  if (existingName !== requiredName) {
    return false
  }

  if (existingRecord.type === 'CNAME' || requiredRecord.type === 'CNAME') {
    return true
  }

  const bothAreRoutingRecords =
    ROUTING_RECORD_TYPES.has(existingRecord.type) && ROUTING_RECORD_TYPES.has(requiredRecord.type)

  if (bothAreRoutingRecords) {
    return true
  }

  return existingRecord.type === requiredRecord.type
}

const recordsAreEqual = (firstRecord: NamecheapDnsRecord, secondRecord: NamecheapDnsRecord) => {
  return (
    normalizeRecordName(firstRecord.name) === normalizeRecordName(secondRecord.name) &&
    firstRecord.type === secondRecord.type &&
    normalizeAddressForComparison(firstRecord) === normalizeAddressForComparison(secondRecord) &&
    firstRecord.mxPreference === secondRecord.mxPreference
  )
}

const validateRequiredDnsRecord = (record: NamecheapDnsRecord) => {
  if (!record.name.trim() || !record.address.trim()) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Required DNS record is incomplete')
  }

  if (!Number.isInteger(record.ttl) || record.ttl < 60 || record.ttl > 60_000) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Required DNS record TTL is invalid')
  }

  if (record.type === 'MX' && record.mxPreference === null) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Required MX preference is missing')
  }
}

export const mergePurchasedDomainDnsRecords = ({
  domain,
  existingRecords,
  requiredRecords,
}: {
  domain: string
  existingRecords: NamecheapDnsRecord[]
  requiredRecords: NamecheapDnsRecord[]
}): NamecheapDnsRecord[] => {
  const normalizedDomain = domain.trim().toLowerCase()

  if (!normalizedDomain) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Purchased domain is missing')
  }

  if (requiredRecords.length === 0) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Required DNS records are missing')
  }

  requiredRecords.forEach(validateRequiredDnsRecord)

  let mergedRecords = existingRecords.filter((record) => {
    return !isNamecheapParkingRecord(record, normalizedDomain)
  })

  requiredRecords.forEach((requiredRecord) => {
    mergedRecords = mergedRecords.filter((existingRecord) => {
      return !recordsConflict(existingRecord, requiredRecord)
    })

    mergedRecords.push(requiredRecord)
  })

  return mergedRecords.filter((record, recordIndex, records) => {
    const firstMatchingIndex = records.findIndex((candidateRecord) => {
      return recordsAreEqual(candidateRecord, record)
    })

    return firstMatchingIndex === recordIndex
  })
}
