import { CustomJwtPayload } from '../shared/interfaces/CustomJwtPayload'

declare global {
  namespace Express {
    interface Request {
      user: CustomJwtPayload
    }
  }
}
