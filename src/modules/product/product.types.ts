import { Request } from 'express'

export interface PublicProductQuery {
  page?: string
  limit?: string
  minPrice?: string
  maxPrice?: string
  search?: string
}

export interface ProductParams {
  id: string
}

export interface AuthRequest<
  P = object,
  ResBody = object,
  ReqBody = object,
  ReqQuery = object,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: {
    id: string
    role: string
  }
}

export interface AdminProductQuery {
  page?: string
  limit?: string
  status?: string
  isDeleted?: string
}
