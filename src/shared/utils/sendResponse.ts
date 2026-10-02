import type { Response } from 'express'

type TResponse<T> = {
  success: boolean
  statusCode: number
  message: string
  data?: T
  meta?: Record<string, unknown>
}

export const sendResponse = <T>(res: Response, data: TResponse<T>) => {
  res.status(data.statusCode).json({
    success: data.success,
    message: data.message,
    data: data.data,
  })
}
