import axios from 'axios'
import { StatusCodes } from 'http-status-codes'

import { env } from '../../../../config/env.js'
import AppError from '../../../../shared/errors/AppError.js'
import { CHECKOUT_ERROR_CODES } from '../../../../shared/errors/checkoutErrorCodes.js'
import { createEpsHash } from './eps.crypto.js'
import type {
  EpsInitializeResponse,
  EpsInitiatePaymentInput,
  EpsTokenResponse,
  EpsVerifyResponse,
} from './eps.types.js'

const EPS_REQUEST_TIMEOUT = 10000

const createEpsError = (message: string) =>
  new AppError(StatusCodes.BAD_GATEWAY, message, CHECKOUT_ERROR_CODES.PAYMENT_GATEWAY_UNAVAILABLE)

export const authenticateEps = async (): Promise<string> => {
  const hash = createEpsHash(env.EPS_USERNAME, env.EPS_HASH_KEY)

  try {
    const response = await axios.post<EpsTokenResponse>(
      `${env.EPS_BASE_URL}/v1/Auth/GetToken`,
      {
        userName: env.EPS_USERNAME,
        password: env.EPS_PASSWORD,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-hash': hash,
        },
        timeout: EPS_REQUEST_TIMEOUT,
      }
    )

    const token = response.data.token?.trim()

    if (!token) {
      console.error('[EPS] Authentication rejected', {
        errorCode: response.data.errorCode,
        errorMessage: response.data.errorMessage,
      })

      throw createEpsError('Unable to authenticate with EPS payment gateway')
    }

    return token
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    console.error('[EPS] Authentication request failed')

    throw createEpsError('Unable to authenticate with EPS payment gateway')
  }
}

const buildEpsReturnUrl = (
  baseUrl: string,
  transactionId: string,
  merchantTransactionId: string
): string => {
  const url = new URL(baseUrl)
  url.searchParams.set('transactionId', transactionId)
  url.searchParams.set('merchantTransactionId', merchantTransactionId)

  return url.toString()
}

export const initiateEpsPayment = async (
  payload: EpsInitiatePaymentInput
): Promise<EpsInitializeResponse> => {
  const token = await authenticateEps()

  const hash = createEpsHash(payload.merchantTransactionId, env.EPS_HASH_KEY)

  try {
    const response = await axios.post<EpsInitializeResponse>(
      `${env.EPS_BASE_URL}/v1/EPSEngine/InitializeEPS`,
      {
        merchantId: env.EPS_MERCHANT_ID,
        storeId: env.EPS_STORE_ID,

        CustomerOrderId: payload.customerOrderId,
        merchantTransactionId: payload.merchantTransactionId,

        transactionTypeId: 1,
        financialEntityId: 0,
        transitionStatusId: 0,

        totalAmount: payload.amount,
        ipAddress: payload.ipAddress ?? '',
        version: '1',

        successUrl: buildEpsReturnUrl(
          env.EPS_SUCCESS_URL,
          payload.customerOrderId,
          payload.merchantTransactionId
        ),
        failUrl: buildEpsReturnUrl(
          env.EPS_FAIL_URL,
          payload.customerOrderId,
          payload.merchantTransactionId
        ),
        cancelUrl: buildEpsReturnUrl(
          env.EPS_CANCEL_URL,
          payload.customerOrderId,
          payload.merchantTransactionId
        ),
        ipnUrl: env.EPS_IPN_URL,

        customerName: payload.customer.name,
        customerEmail: payload.customer.email,
        customerAddress: payload.customer.address,
        customerAddress2: '',
        customerCity: payload.customer.city,
        customerState: payload.customer.state,
        customerPostcode: payload.customer.postcode,
        customerCountry: payload.customer.country,
        customerPhone: payload.customer.phone,

        shipmentName: '',
        shipmentAddress: '',
        shipmentAddress2: '',
        shipmentCity: '',
        shipmentState: '',
        shipmentPostcode: '',
        shipmentCountry: '',

        valueA: '',
        valueB: '',
        valueC: '',
        valueD: '',

        shippingMethod: 'NO',
        noOfItem: '1',
        productName: payload.productName,
        productProfile: 'general',
        productCategory: payload.productCategory,
        ProductList: [],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-hash': hash,
        },
        timeout: EPS_REQUEST_TIMEOUT,
      }
    )

    const redirectUrl = response.data.RedirectURL?.trim()

    if (!redirectUrl) {
      throw createEpsError(response.data.ErrorMessage || 'EPS did not return a payment URL')
    }

    return response.data
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data
      const epsErrorCode =
        typeof responseData?.ErrorCode === 'string'
          ? responseData.ErrorCode
          : typeof responseData?.errorCode === 'string'
            ? responseData.errorCode
            : undefined
      const epsErrorMessage =
        typeof responseData?.ErrorMessage === 'string'
          ? responseData.ErrorMessage
          : typeof responseData?.errorMessage === 'string'
            ? responseData.errorMessage
            : undefined
      const epsMessage =
        typeof responseData?.Message === 'string'
          ? responseData.Message
          : typeof responseData?.message === 'string'
            ? responseData.message
            : undefined

      console.error('[EPS] Payment initialization failed', {
        status: error.response?.status,
        ...(epsErrorCode ? { epsErrorCode } : {}),
        ...(epsErrorMessage ? { epsErrorMessage } : {}),
        ...(epsMessage ? { epsMessage } : {}),
      })
    } else {
      console.error('[EPS] Payment initialization failed')
    }

    throw createEpsError('Unable to start the EPS payment session')
  }
}

export const verifyEpsPayment = async (
  merchantTransactionId: string
): Promise<EpsVerifyResponse> => {
  const token = await authenticateEps()

  const hash = createEpsHash(merchantTransactionId, env.EPS_HASH_KEY)

  try {
    const response = await axios.get<EpsVerifyResponse>(
      `${env.EPS_BASE_URL}/v1/EPSEngine/CheckMerchantTransactionStatus`,
      {
        params: {
          merchantTransactionId,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'x-hash': hash,
        },
        timeout: EPS_REQUEST_TIMEOUT,
      }
    )

    if (!response.data.MerchantTransactionId) {
      throw createEpsError('Unable to verify EPS payment')
    }

    return response.data
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    console.error('[EPS] Payment verification failed for transaction=%s', merchantTransactionId)

    throw createEpsError('Unable to verify EPS payment')
  }
}
