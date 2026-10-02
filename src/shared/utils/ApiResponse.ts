import type { Response } from 'express'

const success = (res: Response, data: any, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  })
}

const error = (res: Response, message = 'Error', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
  })
}

export const ApiResponse = {
  success,
  error,
}
