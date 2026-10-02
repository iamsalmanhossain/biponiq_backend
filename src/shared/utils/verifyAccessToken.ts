import jwt from 'jsonwebtoken'

import { env } from '../../config/env.js'
import { CustomJwtPayload } from '../interfaces/CustomJwtPayload.js'

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as CustomJwtPayload
}
