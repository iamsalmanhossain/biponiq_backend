import { Queue } from 'bullmq'

import { redisConnection } from '../../../config/bullmq.config.js'

import {
  CONFIGURE_PURCHASED_DOMAIN_DNS_JOB_NAME,
  DOMAIN_REGISTRATION_QUEUE_NAME,
  REGISTER_PAID_DOMAIN_JOB_NAME,
  VERIFY_PURCHASED_DOMAIN_ACTIVATION_JOB_NAME,
} from './domainRegistration.constants.js'

import type { DomainRegistrationJobData } from './domainRegistration.types.js'

const domainRegistrationQueue = new Queue<DomainRegistrationJobData>(
  DOMAIN_REGISTRATION_QUEUE_NAME,
  {
    connection: redisConnection,
  }
)

const getPurchasedDomainVerificationDelay = (verificationAttempt: number) => {
  if (verificationAttempt === 1) {
    return 30_000
  }

  if (verificationAttempt <= 6) {
    return 60_000
  }

  if (verificationAttempt <= 18) {
    return 5 * 60_000
  }

  return 30 * 60_000
}

export const enqueuePaidDomainRegistration = async (purchasedDomainId: string) => {
  return domainRegistrationQueue.add(
    REGISTER_PAID_DOMAIN_JOB_NAME,
    {
      purchasedDomainId,
    },
    {
      jobId: `paid-domain-${purchasedDomainId}`,
    }
  )
}

export const enqueuePurchasedDomainDnsConfiguration = async (purchasedDomainId: string) => {
  return domainRegistrationQueue.add(
    CONFIGURE_PURCHASED_DOMAIN_DNS_JOB_NAME,
    {
      purchasedDomainId,
    },
    {
      jobId: `purchased-domain-dns-${purchasedDomainId}`,

      attempts: 5,

      backoff: {
        type: 'exponential',
        delay: 30_000,
      },

      removeOnComplete: {
        count: 500,
      },

      removeOnFail: {
        count: 500,
      },
    }
  )
}

export const enqueuePurchasedDomainActivationVerification = async (
  purchasedDomainId: string,
  verificationAttempt = 1
) => {
  if (!Number.isInteger(verificationAttempt) || verificationAttempt < 1) {
    throw new Error('Purchased domain verification attempt is invalid')
  }

  return domainRegistrationQueue.add(
    VERIFY_PURCHASED_DOMAIN_ACTIVATION_JOB_NAME,
    {
      purchasedDomainId,
      verificationAttempt,
    },
    {
      jobId: `purchased-domain-verification-${purchasedDomainId}-${verificationAttempt}`,

      delay: getPurchasedDomainVerificationDelay(verificationAttempt),

      removeOnComplete: {
        count: 500,
      },

      removeOnFail: {
        count: 500,
      },
    }
  )
}
