import { PurchasedDomainStatus } from '@prisma/client'
import { Worker } from 'bullmq'

import { redisConnection } from '../config/bullmq.config.js'

import {
  CONFIGURE_PURCHASED_DOMAIN_DNS_JOB_NAME,
  DOMAIN_REGISTRATION_QUEUE_NAME,
  PURCHASED_DOMAIN_VERIFICATION_MAX_ATTEMPTS,
  REGISTER_PAID_DOMAIN_JOB_NAME,
  VERIFY_PURCHASED_DOMAIN_ACTIVATION_JOB_NAME,
} from '../modules/domain/registration/domainRegistration.constants.js'

import {
  enqueuePurchasedDomainActivationVerification,
  enqueuePurchasedDomainDnsConfiguration,
} from '../modules/domain/registration/domainRegistration.queue.js'

import { processPaidDomainRegistration } from '../modules/domain/registration/domainRegistration.service.js'

import { processPurchasedDomainDnsConfiguration } from '../modules/domain/provisioning/domainProvisioning.service.js'

import { verifyPurchasedDomainActivation } from '../modules/domain/verification/purchasedDomainVerification.service.js'

import type { DomainRegistrationJobData } from '../modules/domain/registration/domainRegistration.types.js'

const processDomainRegistrationJob = async (purchasedDomainId: string) => {
  const registrationResult = await processPaidDomainRegistration(purchasedDomainId)

  if (
    registrationResult.status === PurchasedDomainStatus.REGISTERED ||
    registrationResult.status === PurchasedDomainStatus.DNS_FAILED
  ) {
    await enqueuePurchasedDomainDnsConfiguration(purchasedDomainId)
  }

  return {
    stage: 'registration' as const,
    ...registrationResult,
  }
}

const processDomainDnsConfigurationJob = async (purchasedDomainId: string) => {
  const dnsConfigurationResult = await processPurchasedDomainDnsConfiguration(purchasedDomainId)

  if (dnsConfigurationResult.status === PurchasedDomainStatus.READY_TO_ACTIVATE) {
    await enqueuePurchasedDomainActivationVerification(purchasedDomainId)
  }

  return {
    stage: 'dns-configuration' as const,

    ...dnsConfigurationResult,
  }
}

const scheduleNextActivationVerification = async (
  purchasedDomainId: string,
  verificationAttempt: number
): Promise<boolean> => {
  if (verificationAttempt >= PURCHASED_DOMAIN_VERIFICATION_MAX_ATTEMPTS) {
    return false
  }

  await enqueuePurchasedDomainActivationVerification(purchasedDomainId, verificationAttempt + 1)

  return true
}

const processDomainActivationVerificationJob = async (
  purchasedDomainId: string,
  verificationAttempt: number
) => {
  let verificationResult: Awaited<ReturnType<typeof verifyPurchasedDomainActivation>>

  try {
    verificationResult = await verifyPurchasedDomainActivation(purchasedDomainId)
  } catch (error) {
    console.error('[Domain Provisioning] Activation verification threw - scheduling retry', {
      purchasedDomainId,
      verificationAttempt,
      maxAttempts: PURCHASED_DOMAIN_VERIFICATION_MAX_ATTEMPTS,
      errorType: error instanceof Error ? error.name : typeof error,
    })

    const nextVerificationScheduled = await scheduleNextActivationVerification(
      purchasedDomainId,
      verificationAttempt
    )

    return {
      stage: 'activation-verification' as const,
      verificationAttempt,
      nextVerificationScheduled,
      verificationExhausted: !nextVerificationScheduled,
      verificationErrored: true as const,
    }
  }

  const isPending = 'pending' in verificationResult && verificationResult.pending

  let nextVerificationScheduled = false

  if (isPending) {
    nextVerificationScheduled = await scheduleNextActivationVerification(
      purchasedDomainId,
      verificationAttempt
    )
  }

  return {
    stage: 'activation-verification' as const,

    verificationAttempt,

    nextVerificationScheduled,

    verificationExhausted: isPending && !nextVerificationScheduled,

    ...verificationResult,
  }
}

export const domainRegistrationWorker = new Worker<DomainRegistrationJobData>(
  DOMAIN_REGISTRATION_QUEUE_NAME,

  async (job) => {
    const purchasedDomainId = job.data.purchasedDomainId

    if (job.name === REGISTER_PAID_DOMAIN_JOB_NAME) {
      return processDomainRegistrationJob(purchasedDomainId)
    }

    if (job.name === CONFIGURE_PURCHASED_DOMAIN_DNS_JOB_NAME) {
      return processDomainDnsConfigurationJob(purchasedDomainId)
    }

    if (job.name === VERIFY_PURCHASED_DOMAIN_ACTIVATION_JOB_NAME) {
      const verificationAttempt = job.data.verificationAttempt ?? 1

      return processDomainActivationVerificationJob(purchasedDomainId, verificationAttempt)
    }

    throw new Error(`Unsupported domain provisioning job: ${job.name}`)
  },

  {
    connection: redisConnection,
    concurrency: 1,
  }
)

domainRegistrationWorker.on('completed', (job, result) => {
  console.log(`[Domain Provisioning] Job ${job.id} completed.`, result)
})

domainRegistrationWorker.on('failed', (job, error) => {
  console.error(`[Domain Provisioning] Job ${job?.id} failed:`, error.message)
})

domainRegistrationWorker.on('error', (error) => {
  console.error('[Domain Provisioning] Worker error:', error.message)
})
