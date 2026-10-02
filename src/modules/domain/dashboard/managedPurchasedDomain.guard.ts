import { PaymentStatus, PurchasedDomainStatus } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import catchAsync from '../../../shared/utils/catchAsync.js'

const MANAGED_PURCHASED_DOMAIN_STATUSES: PurchasedDomainStatus[] = [
  PurchasedDomainStatus.REGISTRATION_PENDING,
  PurchasedDomainStatus.REGISTERING,
  PurchasedDomainStatus.REGISTERED,
  PurchasedDomainStatus.DNS_CONFIGURING,
  PurchasedDomainStatus.READY_TO_ACTIVATE,
  PurchasedDomainStatus.ACTIVE,
  PurchasedDomainStatus.REGISTRATION_FAILED,
  PurchasedDomainStatus.DNS_FAILED,
]

export const blockManualCustomDomainForPurchasedDomain = catchAsync(async (req, _res, next) => {
  const userId = req.user.id

  const managedPurchasedDomain = await prisma.purchasedDomain.findFirst({
    where: {
      vendor: {
        userId,
      },

      subscriptionPayment: {
        paymentStatus: PaymentStatus.PAID,
      },

      status: {
        in: MANAGED_PURCHASED_DOMAIN_STATUSES,
      },
    },
    select: {
      id: true,
    },
  })

  if (managedPurchasedDomain) {
    throw new AppError(httpStatus.CONFLICT, 'A purchased domain is already managed for this store.')
  }

  next()
})
