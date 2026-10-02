import type { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client'

export const ONLINE_PAYMENT_PROVIDERS = [
  'SSLCOMMERZ',
  'EPS',
] as const satisfies readonly PaymentMethod[]

export type OnlinePaymentProvider = (typeof ONLINE_PAYMENT_PROVIDERS)[number]

export type PaymentCustomer = {
  name: string
  email: string | null
  phone: string
  address: string
  city: string
  state: string
}

export type InitiatePaymentInput = {
  transactionId: string
  amount: number
  customer: PaymentCustomer
  product?: {
    name: string
    category: string
  }
}

export type InitiatePaymentResult = {
  gatewayPageURL: string
  providerTransactionId?: string
  gatewayData?: Prisma.InputJsonValue
}

export type NormalizedPaymentStatus = PaymentStatus

export type NormalizedPaymentResult = {
  transactionId: string
  providerTransactionId?: string
  status: NormalizedPaymentStatus
  amount: number
  currency?: string
}

export type PaymentProvider = {
  readonly method: OnlinePaymentProvider

  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>
}

export type PaymentVerifier<TVerificationInput> = {
  verify(input: TVerificationInput): Promise<NormalizedPaymentResult>
}

export type ProcessPaymentCallbackInput<TCallbackPayload> = {
  payload: TCallbackPayload
  expectedAmount: number
  expectedTransactionId: string
  amountMismatchMessage?: string
}

export type ProcessPaymentCallbackResult = {
  payment: NormalizedPaymentResult
}

export type PaymentCallbackProcessor<TCallbackPayload> = {
  processCallback(
    input: ProcessPaymentCallbackInput<TCallbackPayload>
  ): Promise<ProcessPaymentCallbackResult>
}
