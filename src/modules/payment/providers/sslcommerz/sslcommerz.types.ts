export type SSLCommerzCallbackStatus = 'VALID' | 'FAILED' | 'CANCELLED'

export type SSLCommerzCallbackPayload = {
  tran_id: string
  status: SSLCommerzCallbackStatus
  val_id?: string
  amount?: string
  currency?: string
}

export type SSLCommerzVerificationInput = {
  payload: SSLCommerzCallbackPayload
  expectedAmount: number
  expectedTransactionId: string
  amountMismatchMessage: string
}

export type SSLCommerzSessionPayload = {
  transactionId: string
  amount: number
  customerName: string
  customerEmail: string | null
  customerCity: string
  customerState: string
  customerPhone: string
  customerAddress: string
}
