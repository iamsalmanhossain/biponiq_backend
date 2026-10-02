import SSLCommerzPayment from 'sslcommerz-lts'
import httpStatus from 'http-status'
import AppError from '../../../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../../../shared/errors/checkoutErrorCodes.js'
import type { SSLCommerzSessionPayload } from './sslcommerz.types.js'

const PAYMENT_GATEWAY_ERROR_MESSAGE = 'Unable to start the payment session. Please try again.'

export const initiateSslcommerzPayment = async (
  payload: SSLCommerzSessionPayload
): Promise<{ gatewayPageURL: string }> => {
  const storeId = process.env.SSLCOMMERZ_STORE_ID as string
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD as string
  const isLive = process.env.SSLCOMMERZ_IS_LIVE === 'true'

  const sslcz = new SSLCommerzPayment(storeId, storePassword, isLive)

  const data = {
    total_amount: payload.amount,
    currency: 'BDT',
    tran_id: payload.transactionId,

    success_url: process.env.SSLCOMMERZ_SUCCESS_URL,
    fail_url: process.env.SSLCOMMERZ_FAIL_URL,
    cancel_url: process.env.SSLCOMMERZ_CANCEL_URL,
    ipn_url: process.env.SSLCOMMERZ_IPN_URL,

    shipping_method: 'Courier',
    product_name: 'Marketplace Order',
    product_category: 'Ecommerce',
    product_profile: 'general',

    cus_name: payload.customerName,
    cus_email: payload.customerEmail ?? 'exampleadmin@gmail.com',
    cus_add1: payload.customerAddress,
    cus_city: payload.customerCity,
    cus_state: payload.customerState,
    cus_postcode: '1200',
    cus_country: 'Bangladesh',
    cus_phone: payload.customerPhone,

    ship_name: payload.customerName,
    ship_add1: payload.customerAddress,
    ship_add2: payload.customerAddress,
    ship_city: payload.customerCity,
    ship_state: payload.customerState,
    ship_postcode: '1200',
    ship_country: 'Bangladesh',
  }

  let response: Awaited<ReturnType<typeof sslcz.init>>

  try {
    response = await sslcz.init(data)
  } catch (err) {
    // Log internally without exposing secrets or raw provider details to the client.
    console.error(
      '[SSLCommerz] Session init failed for tran_id=%s: %s',
      payload.transactionId,
      err instanceof Error ? err.message : String(err)
    )
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      PAYMENT_GATEWAY_ERROR_MESSAGE,
      CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE
    )
  }

  const gatewayPageURL =
    typeof response.GatewayPageURL === 'string' ? response.GatewayPageURL.trim() : ''

  if (!gatewayPageURL) {
    console.error(
      '[SSLCommerz] Missing or empty GatewayPageURL for tran_id=%s',
      payload.transactionId
    )
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      PAYMENT_GATEWAY_ERROR_MESSAGE,
      CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE
    )
  }

  return { gatewayPageURL }
}

export const validateSslcommerzPayment = async (valid: string) => {
  const storeId = process.env.SSLCOMMERZ_STORE_ID as string
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD as string
  const isLive = process.env.SSLCOMMERZ_IS_LIVE === 'true'

  const sslcz = new SSLCommerzPayment(storeId, storePassword, isLive)

  const response = await sslcz.validate({
    val_id: valid,
  })

  return response
}
