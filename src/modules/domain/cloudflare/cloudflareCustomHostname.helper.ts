import type { Prisma } from '@prisma/client'

import type { CloudflareCustomHostnameResult } from './cloudflareCustomHostname.types.js'

export const getCloudflareVerificationSnapshot = (
  cloudflareHostname: CloudflareCustomHostnameResult
): Prisma.InputJsonObject => {
  const ownershipVerification = cloudflareHostname.ownershipVerification

  return {
    version: 1,

    hostnameStatus: cloudflareHostname.status,

    sslStatus: cloudflareHostname.sslStatus,

    ownershipVerification: ownershipVerification
      ? {
          type: ownershipVerification.type,

          name: ownershipVerification.name,

          value: ownershipVerification.value,
        }
      : null,

    sslValidationRecords: cloudflareHostname.sslValidationRecords.map((record) => {
      return {
        status: record.status,

        txtName: record.txtName,
        txtValue: record.txtValue,

        cname: record.cname,

        cnameTarget: record.cnameTarget,
      }
    }),
  }
}
