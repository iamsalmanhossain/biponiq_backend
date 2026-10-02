import httpStatus from 'http-status'
import AppError from '../errors/AppError.js'
import { TFilterOptions, TFilterReturn } from './filter.types.js'

export const calculateFilters = (options: TFilterOptions): TFilterReturn => {
  const search = options.search?.trim()

  const minPrice = options.minPrice !== undefined ? Number(options.minPrice) : undefined

  const maxPrice = options.maxPrice !== undefined ? Number(options.maxPrice) : undefined

  const subDomain = options.subDomain?.trim()
  const identifier = options.identifier?.trim()

  if (minPrice !== undefined && Number.isNaN(minPrice)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid minPrice')
  }

  if (maxPrice !== undefined && Number.isNaN(maxPrice)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid maxPrice')
  }

  return {
    ...(search !== undefined && { search }),
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
    ...(subDomain !== undefined && { subDomain }),
    ...(identifier !== undefined && { identifier }),
  }
}
