import { JwtPayload } from 'jsonwebtoken'

export interface CustomJwtPayload extends JwtPayload {
  id: string
  email: string
  role: string
  name?: string
  avatar?: string
  impersonatedBy?: string // admin এর userId — impersonation session এ set হয়
}
