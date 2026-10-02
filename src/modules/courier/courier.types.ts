import { CourierProvider } from '@prisma/client'

export interface SteadfastCredentials {
  apiKey: string
  secretKey: string
}

export interface RedXCredentials {
  apiToken: string
  sandbox?: boolean
}

export interface PathaoCredentials {
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
  storeId?: number
  accessToken?: string
  sandbox?: boolean
}

export interface CarryBeeCredentials {
  clientId: string
  clientSecret: string
  clientContext: string
  storeId?: number
  sandbox?: boolean
  baseUrl?: string
}

export type CourierCredentialsMap = {
  [CourierProvider.STEADFAST]: SteadfastCredentials
  [CourierProvider.REDX]: RedXCredentials
  [CourierProvider.PATHAO]: PathaoCredentials
  [CourierProvider.CARRYBEE]: CarryBeeCredentials
  [CourierProvider.COURIER_BD]?: Record<string, any>
}

export interface CourierOrderPayload {
  orderId?: string
  invoice: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  codAmount: number
  note?: string
  itemDescription?: string
  deliveryAreaId?: number
  cityId?: number
  zoneId?: number
  areaId?: number
  recipientSecondaryPhone?: string
  storeId?: number
  deliveryType?: number
  itemType?: number
  itemWeight?: number
  itemQuantity?: number
  isClosedBox?: boolean
  isExchange?: boolean
}

export interface CourierOrderResponse {
  success: boolean
  consignmentId?: string
  trackingCode?: string
  status?: string
  message?: string
  rawResponse?: any
  courierOrder?: any
}

export interface CourierStatusResponse {
  consignmentId: string
  status: string
  trackingCode?: string
  rawResponse?: any
  courierOrder?: any
}

export interface CourierBalanceResponse {
  balance: number
  currency?: string
  rawResponse?: any
}

export interface SaveCourierCredentialsDto {
  provider: CourierProvider
  credentials: Record<string, any>
  isEnabled?: boolean
  isDefault?: boolean
}

export interface GetCourierOrdersQuery {
  page?: number
  limit?: number
  provider?: CourierProvider
  status?: string
  searchTerm?: string
  orderId?: string
}

