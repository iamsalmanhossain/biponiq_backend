import type { CheckoutErrorCode } from './checkoutErrorCodes.js'

class AppError extends Error {
  public statusCode: number
  public code?: CheckoutErrorCode | string

  constructor(statusCode: number, message: string, code?: CheckoutErrorCode | string, stack = '') {
    super(message)
    this.statusCode = statusCode

    // Only assign code when a value is provided.
    // Guarding with `if` is required because exactOptionalPropertyTypes is enabled —
    // assigning `undefined` to an optional property is a type error under that flag.
    if (code !== undefined) {
      this.code = code
    }

    if (stack) {
      this.stack = stack
    } else {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

export default AppError
