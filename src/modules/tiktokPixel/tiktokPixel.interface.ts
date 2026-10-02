export interface TiktokPixelCredentialsPayload {
  tiktokPixelId: string
  tiktokAccessToken: string
  tiktokTestCode?: string | null
}

export interface TiktokCustomerData {
  email?: string
  phone?: string
  name?: string
  city?: string
  country?: string
  zipCode?: string
  external_id?: string
  ttclid?: string
  ttp?: string
  client_ip_address?: string
  client_user_agent?: string
}

export interface TiktokEventContentItem {
  content_id?: string
  content_name?: string
  content_type?: string
  content_category?: string
  price?: number
  quantity?: number
  description?: string
  brand?: string
}

export interface TiktokEventProperties {
  currency?: string
  value?: number
  contents?: TiktokEventContentItem[]
  query?: string
  description?: string
  order_id?: string
  status?: string
  [key: string]: any
}

export interface DynamicTiktokEventPayload {
  eventName: string // e.g., 'ViewContent', 'AddToCart', 'InitiateCheckout', 'PlaceAnOrder', 'CompletePayment', 'Search', 'Contact'
  eventId: string // Deduplication ID matching client-side ttq.track
  eventTime?: number // Epoch timestamp in seconds
  url?: string
  testEventCode?: string
  customerData?: TiktokCustomerData
  eventData?: TiktokEventProperties
}
