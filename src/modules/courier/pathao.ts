import axios, { AxiosInstance } from 'axios'
import { BaseCourier } from './base.js'
import {
  CourierBalanceResponse,
  CourierOrderPayload,
  CourierOrderResponse,
  CourierStatusResponse,
  PathaoCredentials,
} from './courier.types.js'

export class PathaoCourier extends BaseCourier {
  private client!: AxiosInstance
  private accessToken: string | undefined
  private storeId: number | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private username: string | undefined
  private password: string | undefined
  private baseUrl: string


  private readonly prodBaseUrl = 'https://api-hermes.pathao.com'
  private readonly sandboxBaseUrl = 'https://courier-api-sandbox.pathao.com'

  constructor(credentials: Record<string, any>) {
    super(credentials)
    const typedCreds = credentials as PathaoCredentials & { baseUrl?: string }

    const isSandbox =
      typedCreds.sandbox === true ||
      String(typedCreds.sandbox).toLowerCase() === 'true'

    this.baseUrl =
      typedCreds.baseUrl ||
      (isSandbox ? this.sandboxBaseUrl : this.prodBaseUrl)

    this.accessToken = typedCreds.accessToken?.replace(/^Bearer\s+/i, '').trim()
    this.storeId = typedCreds.storeId ? Number(typedCreds.storeId) : undefined
    this.clientId = typedCreds.clientId
    this.clientSecret = typedCreds.clientSecret
    this.username = typedCreds.username
    this.password = typedCreds.password

    this.initClient()
  }

  private initClient() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.accessToken
          ? { Authorization: `Bearer ${this.accessToken}` }
          : {}),
      },
      timeout: 15000,
    })
  }

  /**
   * Acquire or refresh access token using OAuth client credentials
   */
  private async getValidAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken
    }

    if (
      !this.clientId ||
      !this.clientSecret ||
      !this.username ||
      !this.password
    ) {
      throw new Error(
        'Pathao credentials require either an accessToken or (clientId, clientSecret, username, password).'
      )
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/aladdin/api/v1/issue-token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          username: this.username,
          password: this.password,
          grant_type: 'password',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      )

      const token = response.data?.access_token
      if (!token) {
        throw new Error('Failed to retrieve access token from Pathao.')
      }

      this.accessToken = token
      this.initClient()
      return token
    } catch (error: any) {
      const errorMsg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error.message ||
        'Pathao authentication error'
      throw new Error(`Pathao Auth Failed: ${errorMsg}`)
    }
  }

  /**
   * Auto-fetch merchant's active store_id from Pathao if not provided or invalid
   */
  private async getPrimaryStoreId(): Promise<number> {
    try {
      await this.getValidAccessToken()
      const response = await this.client.get('/aladdin/api/v1/stores')
      const stores = response.data?.data?.data || response.data?.data
      if (Array.isArray(stores) && stores.length > 0) {
        const activeStore =
          stores.find(
            (s: any) => s.is_active === 1 || s.is_active === true
          ) || stores[0]
        if (activeStore?.store_id) {
          const resolvedId = Number(activeStore.store_id)
          this.storeId = resolvedId
          return resolvedId
        }
      }
    } catch {
      // Fallthrough to fallback
    }

    if (this.storeId) return Number(this.storeId)
    throw new Error('Pathao requires a valid storeId.')
  }

  /**
   * Validate credentials against Pathao API
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.getValidAccessToken()
      const response = await this.client.get('/aladdin/api/v1/stores')
      return response.status === 200
    } catch {
      return false
    }
  }

  /**
   * Create parcel order in Pathao
   */
  async createOrder(
    payload: CourierOrderPayload
  ): Promise<CourierOrderResponse> {
    try {
      await this.getValidAccessToken()

      let targetStoreId = payload.storeId
      if (!targetStoreId) {
        try {
          targetStoreId = await this.getPrimaryStoreId()
        } catch {
          targetStoreId = this.storeId
        }
      }

      if (!targetStoreId) {
        return {
          success: false,
          message:
            'Pathao requires a valid storeId. Please specify storeId in credentials or order payload.',
        }
      }

      const body = {
        store_id: Number(targetStoreId),
        merchant_order_id: payload.invoice,
        recipient_name: payload.recipientName,
        recipient_phone: payload.recipientPhone,
        recipient_address: payload.recipientAddress,
        delivery_type: payload.deliveryType || 48, // 48 for Normal Delivery
        item_type: payload.itemType || 2, // 2 for Parcel, 1 for Document
        item_quantity: 1,
        item_weight: payload.itemWeight || 0.5,
        item_description:
          payload.itemDescription || payload.note || 'Parcel Item',
        amount_to_collect: Number(payload.codAmount),
        special_instruction: payload.note || '',
      }

      let response
      try {
        response = await this.client.post('/aladdin/api/v1/orders', body)
      } catch (err: any) {
        // If initial store_id was rejected as Wrong Store, attempt auto store lookup and retry
        const errStr = JSON.stringify(err?.response?.data || '')
        if (errStr.includes('Wrong Store') || errStr.includes('store_id')) {
          const autoStoreId = await this.getPrimaryStoreId()
          if (autoStoreId && autoStoreId !== Number(targetStoreId)) {
            body.store_id = autoStoreId
            response = await this.client.post('/aladdin/api/v1/orders', body)
          } else {
            throw err
          }
        } else {
          throw err
        }
      }

      const data = response.data

      const consignmentId =
        data?.data?.consignment_id ||
        data?.consignment_id ||
        data?.data?.merchant_order_id

      if (consignmentId) {
        return {
          success: true,
          consignmentId: String(consignmentId),
          trackingCode: String(consignmentId),
          status: data?.data?.order_status || data?.status || 'pending',
          message: data?.message || 'Order created successfully on Pathao',
          rawResponse: data,
        }
      }

      return {
        success: false,
        message: data?.message || 'Failed to create order on Pathao',
        rawResponse: data,
      }
    } catch (error: any) {
      const responseData = error?.response?.data
      let errorMsg =
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message || responseData?.error) ||
        error.message ||
        'Pathao API error'

      const errors = responseData?.errors
      if (errors) {
        if (typeof errors === 'object') {
          const details = Object.entries(errors)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('; ')
          if (details) errorMsg = `${errorMsg}: ${details}`
        }
      }

      return {
        success: false,
        message: errorMsg,
        rawResponse: responseData || error.message,
      }
    }
  }


  /**
   * Check delivery tracking status
   */
  async checkDeliveryStatus(
    consignmentIdOrTrackingCode: string
  ): Promise<CourierStatusResponse> {
    try {
      await this.getValidAccessToken()
      const response = await this.client.get(
        `/aladdin/api/v1/orders/${consignmentIdOrTrackingCode}`
      )
      const data = response.data

      const currentStatus =
        data?.data?.order_status ||
        data?.order_status ||
        data?.data?.status ||
        'unknown'

      return {
        consignmentId: consignmentIdOrTrackingCode,
        status: currentStatus,
        trackingCode: consignmentIdOrTrackingCode,
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
   * Get account stores / balance info
   */
  async getBalance(): Promise<CourierBalanceResponse> {
    try {
      await this.getValidAccessToken()
      const response = await this.client.get('/aladdin/api/v1/user/profile')
      const data = response.data

      return {
        balance: data?.data?.balance || data?.balance || 0,
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
