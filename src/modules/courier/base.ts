import {
  CourierBalanceResponse,
  CourierOrderPayload,
  CourierOrderResponse,
  CourierStatusResponse,
} from './courier.types.js'

export abstract class BaseCourier {
  protected credentials: Record<string, any>

  constructor(credentials: Record<string, any>) {
    this.credentials = credentials
  }

  /**
   * Validate if the credentials provided are formatted correctly and/or valid against courier API
   */
  abstract validateCredentials(): Promise<boolean>

  /**
   * Create a parcel/order delivery request with the courier
   */
  abstract createOrder(
    payload: CourierOrderPayload
  ): Promise<CourierOrderResponse>

  /**
   * Check tracking / delivery status of a consignment
   */
  abstract checkDeliveryStatus(
    consignmentIdOrTrackingCode: string
  ): Promise<CourierStatusResponse>

  /**
   * Get current account balance with the courier (if supported)
   */
  abstract getBalance(): Promise<CourierBalanceResponse>
}
