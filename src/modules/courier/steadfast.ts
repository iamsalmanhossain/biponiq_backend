import axios, { AxiosInstance } from 'axios'
import { BaseCourier } from './base.js'
import {
  CourierBalanceResponse,
  CourierOrderPayload,
  CourierOrderResponse,
  CourierStatusResponse,
  SteadfastCredentials,
} from './courier.types.js'

export class SteadfastCourier extends BaseCourier {
  private client: AxiosInstance
  private apiKey: string
  private secretKey: string

  private readonly baseUrl: string

  constructor(credentials: Record<string, any>) {
    super(credentials)
    const typedCreds = credentials as SteadfastCredentials & { baseUrl?: string }
    if (!typedCreds?.apiKey || !typedCreds?.secretKey) {
      throw new Error(
        'Steadfast credentials require both apiKey and secretKey.'
      )
    }

    this.apiKey = typedCreds.apiKey
    this.secretKey = typedCreds.secretKey
    // Steadfast / Packzy API base URL
    this.baseUrl = typedCreds.baseUrl || 'https://portal.packzy.com/api/v1'


    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Api-Key': this.apiKey,
        'Secret-Key': this.secretKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }

  /**
   * Validate credentials by attempting to check balance
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.client.get('/get_balance')
      return response.status === 200 && response.data?.status === 200
    } catch {
      return false
    }
  }

  /**
   * Create an order in Steadfast
   */
  async createOrder(
    payload: CourierOrderPayload
  ): Promise<CourierOrderResponse> {
    try {
      const body = {
        invoice: payload.invoice,
        recipient_name: payload.recipientName,
        recipient_phone: payload.recipientPhone,
        recipient_address: payload.recipientAddress,
        cod_amount: payload.codAmount,
        note: payload.note || payload.itemDescription || '',
      }

      const response = await this.client.post('/create_order', body)
      const data = response.data

      if (data?.status === 200 && data?.consignment) {
        return {
          success: true,
          consignmentId: String(data.consignment.consignment_id),
          trackingCode: data.consignment.tracking_code,
          status: data.consignment.status,
          message: data.message || 'Order created successfully on Steadfast',
          rawResponse: data,
        }
      }

      return {
        success: false,
        message: data?.message || 'Failed to create order on Steadfast',
        rawResponse: data,
      }
    } catch (error: any) {
      const responseData = error?.response?.data
      const errorMsg =
        (typeof responseData === 'string' ? responseData : responseData?.message) ||
        error.message ||
        'Steadfast API error'

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
      // Try by consignment id first, fallback to tracking code endpoint if needed
      let endpoint = `/status_by_cid/${consignmentIdOrTrackingCode}`

      const response = await this.client.get(endpoint)
      const data = response.data

      return {
        consignmentId: consignmentIdOrTrackingCode,
        status: data?.delivery_status || data?.status || 'unknown',
        trackingCode: data?.tracking_code,
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
      const response = await this.client.get('/get_balance')
      const data = response.data

      return {
        balance: data?.current_balance || data?.balance || 0,
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
