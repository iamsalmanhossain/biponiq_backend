import axios, { AxiosInstance } from 'axios'
import { BaseCourier } from './base.js'
import {
  CourierBalanceResponse,
  CourierOrderPayload,
  CourierOrderResponse,
  CourierStatusResponse,
  RedXCredentials,
} from './courier.types.js'

export class RedXCourier extends BaseCourier {
  private client: AxiosInstance
  private apiToken: string
  private baseUrl: string

  private readonly prodBaseUrl = 'https://openapi.redx.com.bd/v1.0.0-beta'
  private readonly sandboxBaseUrl = 'https://sandbox.redx.com.bd/v1.0.0-beta'

  constructor(credentials: Record<string, any>) {
    super(credentials)
    const typedCreds = credentials as RedXCredentials & { baseUrl?: string }
    if (!typedCreds?.apiToken) {
      throw new Error('RedX credentials require an apiToken.')
    }

    this.apiToken = typedCreds.apiToken.replace(/^Bearer\s+/i, '').trim()
    const isSandbox =
      typedCreds.sandbox === true ||
      String(typedCreds.sandbox).toLowerCase() === 'true'

    this.baseUrl =
      typedCreds.baseUrl ||
      (isSandbox ? this.sandboxBaseUrl : this.prodBaseUrl)

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'API-ACCESS-TOKEN': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }


  /**
   * Validate credentials against RedX API
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.client.get('/areas')
      return response.status === 200
    } catch {
      return false
    }
  }

  /**
   * Create parcel order in RedX
   */
  async createOrder(
    payload: CourierOrderPayload
  ): Promise<CourierOrderResponse> {
    try {
      const body = {
        customer_name: payload.recipientName,
        customer_phone: payload.recipientPhone,
        delivery_area: payload.recipientAddress,
        delivery_area_id: payload.deliveryAreaId || 1,
        customer_address: payload.recipientAddress,
        merchant_invoice_id: payload.invoice,
        cash_collection_amount: Number(payload.codAmount),
        parcel_weight: 500, // Default weight in grams (500g)
        instruction: payload.note || payload.itemDescription || '',
        value: Number(payload.codAmount) || 1,
      }

      const response = await this.client.post('/parcel', body)
      const data = response.data

      const trackingId =
        data?.tracking_id || data?.tracking_number || data?.parcel?.tracking_id
      const parcelId = data?.parcel_id || data?.parcel?.id

      if (trackingId || parcelId) {
        return {
          success: true,
          consignmentId: String(trackingId || parcelId),
          trackingCode: String(trackingId || parcelId),
          status: data?.status || 'created',
          message: data?.message || 'Parcel created successfully on RedX',
          rawResponse: data,
        }
      }

      return {
        success: false,
        message: data?.message || 'Failed to create parcel on RedX',
        rawResponse: data,
      }
    } catch (error: any) {
      const responseData = error?.response?.data
      let errorMsg =
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message || responseData?.error) ||
        error.message ||
        'RedX API error'

      const errors = responseData?.validation_errors || responseData?.errors
      if (errors) {
        if (Array.isArray(errors)) {
          const details = errors
            .map((e: any) =>
              typeof e === 'object'
                ? Object.values(e).join(', ')
                : String(e)
            )
            .join('; ')
          if (details) errorMsg = `${errorMsg}: ${details}`
        } else if (typeof errors === 'object') {
          errorMsg = `${errorMsg}: ${JSON.stringify(errors)}`
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
      const response = await this.client.get(
        `/parcel/track/${consignmentIdOrTrackingCode}`
      )
      const data = response.data

      const trackingList = data?.tracking || data?.parcel?.tracking
      const latestTrackMsg =
        Array.isArray(trackingList) && trackingList.length > 0
          ? trackingList[trackingList.length - 1]?.message_en || trackingList[0]?.message_en
          : null

      const currentStatus =
        data?.parcel?.status ||
        data?.status ||
        data?.tracking_status ||
        latestTrackMsg ||
        'created'

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
   * Get account balance
   */
  async getBalance(): Promise<CourierBalanceResponse> {
    try {
      const response = await this.client.get('/user/profile')
      const data = response.data

      return {
        balance: data?.balance || data?.user?.balance || 0,
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
