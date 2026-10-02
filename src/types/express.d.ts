import { Vendor } from '@prisma/client'
import 'express'

type UserRole = 'ADMIN' | 'VENDOR' | 'GUESTCUSTOMER'

declare module 'express-serve-static-core' {
  interface Request {
    user: {
      id: string
      role: UserRole
    }
    currentVendor?: Vendor
  }
}

export {}
