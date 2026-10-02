import { ProductStatus } from '@prisma/client'

export type TFilterOptions = {
  search?: string
  minPrice?: string | number
  maxPrice?: string | number
  subDomain?: string
  identifier?: string
}

export type TFilterReturn = {
  search?: string
  minPrice?: number
  maxPrice?: number
  subDomain?: string
  identifier?: string
}

export type TAdminProductFilterOptions = {
  status?: string
  isDeleted?: string
  phone?: string
}

export type TAdminProductFilterReturn = {
  status?: ProductStatus
  isDeleted?: boolean
  phone?: string
}

export const calculateAdminProductFilters = (
  options: TAdminProductFilterOptions
): TAdminProductFilterReturn => {
  return {
    ...(options.status && {
      status: options.status as ProductStatus,
    }),

    ...(options.isDeleted !== undefined && {
      isDeleted: options.isDeleted === 'true',
    }),
    ...(options.phone && {
      phone: options.phone,
    }),
  }
}
