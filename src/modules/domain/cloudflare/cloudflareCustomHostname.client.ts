import httpStatus from 'http-status'

import { env } from '../../../config/env.js'
import AppError from '../../../shared/errors/AppError.js'

import type {
  CloudflareApiResponse,
  CloudflareCustomHostnameResult,
  CloudflareRawCustomHostname,
  CloudflareSslValidationRecord,
} from './cloudflareCustomHostname.types.js'

const CLOUDFLARE_REQUEST_TIMEOUT_MS = 15_000

type CloudflareRequestOptions = {
  method: 'GET' | 'POST'
  body?: Record<string, unknown>
}

const getCloudflareConfig = () => {
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim()

  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim()

  if (!apiToken || !zoneId) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Cloudflare custom hostname service is not configured'
    )
  }

  return {
    apiToken,
    zoneId,
  }
}

const runCloudflareRequest = async <T>(
  path: string,
  options: CloudflareRequestOptions
): Promise<T> => {
  const config = getCloudflareConfig()

  const requestOptions: RequestInit = {
    method: options.method,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,

      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
  }

  if (options.body) {
    requestOptions.body = JSON.stringify(options.body)
  }

  let response: Response

  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}${path}`,
      requestOptions
    )
  } catch {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Cloudflare is temporarily unavailable')
  }

  let data: CloudflareApiResponse<T>

  try {
    data = (await response.json()) as CloudflareApiResponse<T>
  } catch {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Cloudflare returned an invalid response')
  }

  if (!response.ok || !data.success || !data.result) {
    throw new AppError(httpStatus.BAD_GATEWAY, 'Cloudflare rejected the custom hostname request')
  }

  return data.result
}

const getSslValidationRecords = (
  rawHostname: CloudflareRawCustomHostname
): CloudflareSslValidationRecord[] => {
  const rawRecords = rawHostname.ssl?.validation_records ?? []

  return rawRecords.map((record) => ({
    status: record.status?.trim() || null,

    txtName: record.txt_name?.trim() || null,

    txtValue: record.txt_value?.trim() || null,

    cname: record.cname?.trim() || null,

    cnameTarget: record.cname_target?.trim() || null,
  }))
}

const parseCloudflareCustomHostname = (
  rawHostname: CloudflareRawCustomHostname,
  requestedHostname: string
): CloudflareCustomHostnameResult => {
  const id = rawHostname.id?.trim()

  const hostname = rawHostname.hostname?.trim().toLowerCase()

  const status = rawHostname.status?.trim()

  if (!id || !hostname || !status || hostname !== requestedHostname) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Cloudflare returned incomplete custom hostname data'
    )
  }

  const rawOwnershipVerification = rawHostname.ownership_verification

  const hasOwnershipVerification =
    rawOwnershipVerification?.type === 'txt' &&
    Boolean(rawOwnershipVerification.name?.trim()) &&
    Boolean(rawOwnershipVerification.value?.trim())

  return {
    id,
    hostname,
    status,

    ownershipVerification: hasOwnershipVerification
      ? {
          type: 'txt',
          name: rawOwnershipVerification!.name!.trim(),

          value: rawOwnershipVerification!.value!.trim(),
        }
      : null,

    sslStatus: rawHostname.ssl?.status?.trim() || null,

    sslValidationRecords: getSslValidationRecords(rawHostname),
  }
}

export const findCloudflareCustomHostnameByHostname = async (
  requestedHostname: string
): Promise<CloudflareCustomHostnameResult | null> => {
  const hostname = requestedHostname.trim().toLowerCase()

  if (!hostname) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Purchased domain hostname is missing')
  }

  const queryParams = new URLSearchParams()

  queryParams.set('hostname.exact', hostname)

  const rawHostnames = await runCloudflareRequest<CloudflareRawCustomHostname[]>(
    `/custom_hostnames?${queryParams.toString()}`,
    {
      method: 'GET',
    }
  )

  const matchingHostnames = rawHostnames.filter((rawHostname) => {
    return rawHostname.hostname?.trim().toLowerCase() === hostname
  })

  if (matchingHostnames.length > 1) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Multiple Cloudflare custom hostnames exist for this domain'
    )
  }

  const matchingHostname = matchingHostnames[0]

  if (!matchingHostname) {
    return null
  }

  return parseCloudflareCustomHostname(matchingHostname, hostname)
}

export const createCloudflareCustomHostname = async (
  requestedHostname: string
): Promise<CloudflareCustomHostnameResult> => {
  const hostname = requestedHostname.trim().toLowerCase()

  if (!hostname) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Purchased domain hostname is missing')
  }

  const rawHostname = await runCloudflareRequest<CloudflareRawCustomHostname>('/custom_hostnames', {
    method: 'POST',
    body: {
      hostname,
      ssl: {
        method: 'txt',
        type: 'dv',
      },
    },
  })

  return parseCloudflareCustomHostname(rawHostname, hostname)
}

export const getCloudflareCustomHostname = async (
  cloudflareId: string,
  requestedHostname: string
): Promise<CloudflareCustomHostnameResult> => {
  const normalizedCloudflareId = cloudflareId.trim()

  const hostname = requestedHostname.trim().toLowerCase()

  if (!normalizedCloudflareId || !hostname) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cloudflare custom hostname data is incomplete'
    )
  }

  const rawHostname = await runCloudflareRequest<CloudflareRawCustomHostname>(
    `/custom_hostnames/${normalizedCloudflareId}`,
    {
      method: 'GET',
    }
  )

  return parseCloudflareCustomHostname(rawHostname, hostname)
}
