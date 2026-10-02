import axios, { AxiosInstance } from 'axios'
import { BaseCourier } from './base.js'
import {
  CarryBeeCredentials,
  CourierBalanceResponse,
  CourierOrderPayload,
  CourierOrderResponse,
  CourierStatusResponse,
} from './courier.types.js'

export class CarryBeeCourier extends BaseCourier {
  private client: AxiosInstance
  private clientId: string
  private clientSecret: string
  private clientContext: string
  private storeId: number | undefined
  private baseUrl: string

  private readonly prodBaseUrl = 'https://developers.carrybee.com'
  private readonly sandboxBaseUrl = 'https://sandbox.carrybee.com'

  constructor(credentials: Record<string, any>) {
    super(credentials)
    const typedCreds = credentials as CarryBeeCredentials

    const clientId =
      typedCreds?.clientId ||
      (typedCreds as any)?.client_id ||
      (typedCreds as any)?.['Client-Id']
    const clientSecret =
      typedCreds?.clientSecret ||
      (typedCreds as any)?.client_secret ||
      (typedCreds as any)?.['Client-Secret']
    const clientContext =
      typedCreds?.clientContext ||
      (typedCreds as any)?.client_context ||
      (typedCreds as any)?.['Client-Context']

    if (!clientId || !clientSecret || !clientContext) {
      throw new Error(
        'CarryBee credentials require clientId, clientSecret, and clientContext.'
      )
    }

    this.clientId = clientId
    this.clientSecret = clientSecret
    this.clientContext = clientContext
    this.storeId =
      typedCreds?.storeId !== undefined
        ? Number(typedCreds.storeId)
        : (typedCreds as any)?.store_id !== undefined
          ? Number((typedCreds as any).store_id)
          : undefined

    const isSandbox =
      typedCreds.sandbox === true ||
      String(typedCreds.sandbox).toLowerCase() === 'true'

    this.baseUrl =
      typedCreds.baseUrl ||
      (isSandbox ? this.sandboxBaseUrl : this.prodBaseUrl)

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Client-Id': this.clientId,
        'Client-Secret': this.clientSecret,
        'Client-Context': this.clientContext,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    })
  }

  private formatErrorMessage(responseData: any, fallback: string): string {
    if (!responseData) return fallback
    if (typeof responseData === 'string') return responseData

    const baseMsg =
      responseData.message || responseData.error || fallback

    const rawErrors =
      responseData.causes ||
      responseData.errors ||
      responseData.validation_errors ||
      (typeof responseData.data === 'object' &&
        responseData.data !== null &&
        !Array.isArray(responseData.data)
        ? responseData.data
        : null)

    if (!rawErrors) {
      return typeof baseMsg === 'string' ? baseMsg : JSON.stringify(baseMsg)
    }

    if (Array.isArray(rawErrors)) {
      const details = rawErrors
        .map((e: any) =>
          typeof e === 'object' ? Object.values(e).join(', ') : String(e)
        )
        .filter(Boolean)
        .join('; ')
      return details ? `${baseMsg}: ${details}` : baseMsg
    }

    if (typeof rawErrors === 'object') {
      const details = Object.entries(rawErrors)
        .map(([key, val]) => {
          if (Array.isArray(val)) {
            const inner = val
              .map((e: any) =>
                typeof e === 'object' && e !== null
                  ? Object.values(e).join(', ')
                  : String(e)
              )
              .filter(Boolean)
              .join(', ')
            return `${key}: ${inner || 'invalid'}`
          }
          if (typeof val === 'object' && val !== null)
            return `${key}: ${JSON.stringify(val)}`
          return `${key}: ${val}`
        })
        .filter(Boolean)
        .join('; ')
      return details ? `${baseMsg}: ${details}` : baseMsg
    }

    return baseMsg
  }

  private async postWithFallback(endpoints: string[], data: any) {
    let lastError: any = null
    for (const ep of endpoints) {
      try {
        const res = await this.client.post(ep, data)
        return res
      } catch (err: any) {
        lastError = err
        const msg = err?.response?.data?.message || err?.message || ''
        const isRouteError =
          err?.response?.status === 404 ||
          (typeof msg === 'string' &&
            msg.toLowerCase().includes('no route matched'))
        if (!isRouteError) {
          throw err
        }
      }
    }
    throw lastError
  }

  private async getWithFallback(endpoints: string[], config?: any) {
    let lastError: any = null
    for (const ep of endpoints) {
      try {
        const res = await this.client.get(ep, config)
        return res
      } catch (err: any) {
        lastError = err
        const msg = err?.response?.data?.message || err?.message || ''
        const isRouteError =
          err?.response?.status === 404 ||
          (typeof msg === 'string' &&
            msg.toLowerCase().includes('no route matched'))
        if (!isRouteError) {
          throw err
        }
      }
    }
    throw lastError
  }

  /**
   * Validate credentials by testing an API endpoint connection
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Test credentials against CarryBee API
      const response = await this.getWithFallback([
        '/api/v2/stores',
        '/api/v2/cities',
        '/api/v2/orders',
      ])
      return response.status >= 200 && response.status < 300
    } catch (error: any) {
      // If endpoint status is 401 or 403, credentials are invalid
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return false
      }
      // If network returns non-auth status (e.g. 200/404), credentials were accepted
      if (
        error?.response?.status &&
        error?.response?.status !== 401 &&
        error?.response?.status !== 403
      ) {
        return true
      }
      return false
    }
  }

  /**
   * Create an order in CarryBee
   */
  async createOrder(
    payload: CourierOrderPayload
  ): Promise<CourierOrderResponse> {
    try {
      let targetStoreId = payload.storeId ?? this.storeId

      // Verify or fetch store list to ensure valid storeId for this merchant account
      try {
        const storesRes = await this.client.get('/api/v2/stores')
        const stores: any[] =
          storesRes.data?.data?.stores ||
          storesRes.data?.data ||
          storesRes.data?.stores ||
          []

        if (Array.isArray(stores) && stores.length > 0) {
          const match = targetStoreId
            ? stores.find(
                (s) =>
                  Number(s.id) === Number(targetStoreId) ||
                  Number(s.store_id) === Number(targetStoreId)
              )
            : null

          if (match) {
            targetStoreId = match.id || match.store_id
          } else {
            // If provided targetStoreId is invalid / not in merchant's stores, pick default or first store
            const defaultStore =
              stores.find((s) => s.is_default_pickup_store) || stores[0]
            targetStoreId = defaultStore.id || defaultStore.store_id
          }
        }
      } catch {
        // ignore
      }

      if (!targetStoreId) {
        throw new Error(
          'store_id is required for CarryBee order creation. Please create a store in your CarryBee merchant panel.'
        )
      }

      // Convert weight to integer grams (1–25000)
      let weightInGrams = payload.itemWeight ? Number(payload.itemWeight) : 500
      if (weightInGrams > 0 && weightInGrams < 25) {
        // If provided in kg (e.g. 0.5 kg -> 500g)
        weightInGrams = Math.round(weightInGrams * 1000)
      }
      weightInGrams = Math.max(1, Math.min(25000, Math.round(weightInGrams)))

      // Default to Dhaka (city_id: 14, default zone: 50 / Dhanmondi) if not provided
      const resolvedCityId = payload.cityId
        ? Number(payload.cityId)
        : payload.deliveryAreaId
          ? Number(payload.deliveryAreaId)
          : 14
      const resolvedZoneId = payload.zoneId
        ? Number(payload.zoneId)
        : resolvedCityId === 14
          ? 50
          : 1

      const body: Record<string, any> = {
        store_id: String(targetStoreId),
        delivery_type: payload.deliveryType ? Number(payload.deliveryType) : 1,
        product_type: payload.itemType ? Number(payload.itemType) : 1,
        recipient_phone: String(payload.recipientPhone || '').trim(),
        recipient_name: String(payload.recipientName || '').trim(),
        recipient_address: String(payload.recipientAddress || '').trim(),
        city_id: resolvedCityId,
        zone_id: resolvedZoneId,
        item_weight: weightInGrams,
        collectable_amount: Math.round(Number(payload.codAmount || 0)),
      }

      if (payload.invoice) {
        body.merchant_order_id = String(payload.invoice).substring(0, 49)
      }
      if (payload.areaId) {
        body.area_id = Number(payload.areaId)
      }
      if (payload.recipientSecondaryPhone) {
        body.recipient_secendary_phone = String(payload.recipientSecondaryPhone).trim()
      }
      if (payload.note) {
        body.special_instruction = String(payload.note).substring(0, 254)
      }
      if (payload.itemDescription) {
        body.product_description = String(payload.itemDescription).substring(0, 254)
      }
      if (payload.itemQuantity !== undefined) {
        body.item_quantity = Math.max(1, Math.min(200, Number(payload.itemQuantity)))
      }
      if (payload.isClosedBox !== undefined) {
        body.is_closed_box = Boolean(payload.isClosedBox)
      }
      if (payload.isExchange !== undefined) {
        body.is_exchange = Boolean(payload.isExchange)
      }

      const response = await this.client.post('/api/v2/orders', body)
      const data = response.data

      const orderData = data?.data?.order || data?.data || data?.order || data
      const consignmentId =
        orderData?.consignment_id ||
        orderData?.order_id ||
        orderData?.id ||
        data?.consignment_id
      const trackingCode =
        orderData?.tracking_code ||
        orderData?.tracking_number ||
        consignmentId

      if ((data?.error === false || data?.success !== false) && consignmentId) {
        return {
          success: true,
          consignmentId: String(consignmentId),
          trackingCode: String(trackingCode || consignmentId),
          status: orderData?.status || 'created',
          message: data?.message || 'Order created successfully on CarryBee',
          rawResponse: data,
        }
      }

      const failMsg = this.formatErrorMessage(
        data,
        'Failed to create order on CarryBee'
      )
      return {
        success: false,
        message: failMsg,
        rawResponse: data,
      }
    } catch (error: any) {
      const responseData = error?.response?.data
      const errorMsg = this.formatErrorMessage(
        responseData,
        error.message || 'CarryBee API error'
      )

      return {
        success: false,
        message: errorMsg,
        rawResponse: responseData || error.message,
      }
    }
  }

  /**
   * Check delivery status
   */
  async checkDeliveryStatus(
    consignmentIdOrTrackingCode: string
  ): Promise<CourierStatusResponse> {
    try {
      const response = await this.getWithFallback([
        `/api/v2/orders/${consignmentIdOrTrackingCode}`,
        `/orders/${consignmentIdOrTrackingCode}`,
        `/api/v1/orders/${consignmentIdOrTrackingCode}`,
      ])
      const data = response.data

      const status =
        data?.status ||
        data?.data?.status ||
        data?.delivery_status ||
        data?.order_status ||
        'unknown'

      return {
        consignmentId: consignmentIdOrTrackingCode,
        status,
        trackingCode:
          data?.tracking_code ||
          data?.data?.tracking_code ||
          consignmentIdOrTrackingCode,
        rawResponse: data,
      }
    } catch (error: any) {
      return {
        consignmentId: consignmentIdOrTrackingCode,
        status: 'error',
        rawResponse: error?.response?.data || error.message,
      }
    }
  }

  /**
   * Check account balance
   */
  async getBalance(): Promise<CourierBalanceResponse> {
    try {
      const response = await this.getWithFallback([
        '/api/v2/user/balance',
        '/user/balance',
        '/api/v1/user/balance',
      ])
      const data = response.data

      const balance =
        data?.balance ??
        data?.current_balance ??
        data?.data?.balance ??
        0

      return {
        balance: Number(balance),
        currency: 'BDT',
        rawResponse: data,
      }
    } catch (error: any) {
      return {
        balance: 0,
        currency: 'BDT',
        rawResponse: error?.response?.data || error.message,
      }
    }
  }
}
