import AppError from './AppError.js'

export class TokenExpiredError extends AppError {
  constructor() {
    super(401, 'JWT expired')
  }
}
