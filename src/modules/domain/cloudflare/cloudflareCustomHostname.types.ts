export type CloudflareOwnershipVerificationRecord = {
  type: 'txt'
  name: string
  value: string
}

export type CloudflareSslValidationRecord = {
  status: string | null
  txtName: string | null
  txtValue: string | null
  cname: string | null
  cnameTarget: string | null
}

export type CloudflareCustomHostnameResult = {
  id: string
  hostname: string
  status: string

  ownershipVerification: CloudflareOwnershipVerificationRecord | null

  sslStatus: string | null
  sslValidationRecords: CloudflareSslValidationRecord[]
}

export type CloudflareApiError = {
  code?: number
  message?: string
}

export type CloudflareApiResponse<T> = {
  success: boolean
  result?: T
  errors?: CloudflareApiError[]
}

export type CloudflareRawSslValidationRecord = {
  status?: string
  txt_name?: string
  txt_value?: string
  cname?: string
  cname_target?: string
}

export type CloudflareRawCustomHostname = {
  id?: string
  hostname?: string
  status?: string

  ownership_verification?: {
    type?: string
    name?: string
    value?: string
  }

  ssl?: {
    status?: string
    validation_records?: CloudflareRawSslValidationRecord[]
  }
}
