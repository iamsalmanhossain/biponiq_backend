export interface TResponse<T> {
  statusCode: number
  success: boolean
  message: string
  data?: T
}

export interface errResponse {
  success: boolean
  message: string
  stack?: string
  error?: string
}
