export type EpsTokenResponse = {
  token: string
  expireDate: string
  errorMessage: string | null
  errorCode: string | null
}

export type EpsCustomer = {
  name: string
  email: string
  address: string
  city: string
  state: string
  postcode: string
  country: string
  phone: string
}

export type EpsInitiatePaymentInput = {
  customerOrderId: string
  merchantTransactionId: string
  amount: number
  customer: EpsCustomer
  ipAddress?: string
  productName: string
  productCategory: string
}

export type EpsGatewayAttempt = {
  merchantTransactionId: string
  epsTransactionId?: string
}

export type EpsGatewayData = {
  epsAttempts: EpsGatewayAttempt[]
}

export type EpsInitializeResponse = {
  TransactionId: string
  RedirectURL: string
  ErrorMessage: string | null
  ErrorCode: string | null
  FinancialEntityList: unknown
}

export type EpsVerifyResponse = {
  MerchantTransactionId: string
  EpsTransactionId?: string
  Status: string
  TotalAmount: string
  TransactionDate?: string
  TransactionType?: string
  FinancialEntity?: string
  ErrorCode?: string | null
  ErrorMessage?: string | null
}

export type EpsIpnRequest = {
  Data: string
}

export type EpsEncryptedIpnPayload = {
  iv: string
  ciphertext: string
}

export type EpsDecryptedIpnPayload = {
  EpsTransactionId: string
  MerchantTransactionId: string
  StoreId: string | number
  Status: string
  TotalAmount: number | string
  StoreAmount?: number | string
  TransactionDate?: string
  TransactionType?: string
  FinancialEntity?: string
  CustomerId?: string
  CustomerName?: string
  CustomerPhone?: string
  CustomerEmail?: string
  CustomerAddress?: string
  Timestamp?: number
}

export type EpsBrowserReturnType = 'SUCCESS' | 'FAIL' | 'CANCEL'
