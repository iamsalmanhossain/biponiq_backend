import { randomInt } from 'crypto'
import { PaymentMethod } from '@prisma/client'

import type { PaymentProvider } from '../payment-provider.types.js'
import { initiateEpsPayment } from './eps.client.js'
import type { EpsGatewayData } from './eps.types.js'

const EPS_MERCHANT_TRANSACTION_ID_RANDOM_RANGE = 1_000_000_000

// Keep the merchant-facing ID numeric and compact while adding a cryptographically secure suffix.
const createEpsMerchantTransactionId = () => {
  return `${Date.now()}${randomInt(EPS_MERCHANT_TRANSACTION_ID_RANDOM_RANGE)
    .toString()
    .padStart(9, '0')}`
}

export const epsProvider: PaymentProvider = {
  method: PaymentMethod.EPS,

  async initiate(input) {
    const merchantTransactionId = createEpsMerchantTransactionId()

    const response = await initiateEpsPayment({
      customerOrderId: input.transactionId,
      merchantTransactionId,
      amount: input.amount,

      customer: {
        name: input.customer.name,
        email: input.customer.email ?? 'exampleadmin@gmail.com',
        phone: input.customer.phone,
        address: input.customer.address,
        city: input.customer.city,
        state: input.customer.state,
        postcode: '1200',
        country: 'Bangladesh',
      },

      productName: input.product?.name ?? 'Biponiq Subscription',
      productCategory: input.product?.category ?? 'Subscription',
    })

    const gatewayData: EpsGatewayData = {
      epsAttempts: [
        {
          merchantTransactionId,
          epsTransactionId: response.TransactionId,
        },
      ],
    }

    return {
      gatewayPageURL: response.RedirectURL,
      providerTransactionId: response.TransactionId,
      gatewayData,
    }
  },
}
