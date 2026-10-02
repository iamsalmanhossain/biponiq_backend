import { epsProvider } from './eps/eps.provider.js'
import { sslCommerzProvider } from './sslcommerz/sslcommerz.provider.js'
import type { OnlinePaymentProvider, PaymentProvider } from './payment-provider.types.js'

const paymentProviders = {
  SSLCOMMERZ: sslCommerzProvider,
  EPS: epsProvider,
} as const

type PaymentProviderRegistry = typeof paymentProviders
type RegisteredPaymentMethod = keyof PaymentProviderRegistry

export const hasPaymentProvider = (
  method: OnlinePaymentProvider
): method is RegisteredPaymentMethod => {
  return method in paymentProviders
}

export function getPaymentProvider<TMethod extends RegisteredPaymentMethod>(
  method: TMethod
): PaymentProviderRegistry[TMethod]

export function getPaymentProvider(method: OnlinePaymentProvider): PaymentProvider

export function getPaymentProvider(method: OnlinePaymentProvider): PaymentProvider {
  if (!hasPaymentProvider(method)) {
    throw new Error(`Payment provider not implemented: ${method}`)
  }

  return paymentProviders[method]
}
