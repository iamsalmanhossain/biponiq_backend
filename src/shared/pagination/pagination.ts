import { TPaginationOptions, TPaginationReturn } from './pagination.types.js'

export const calculatePagination = (options: TPaginationOptions): TPaginationReturn => {
  const page = Number(options.page) || 1
  const limit = Number(options.limit) || 10
  const skip = (page - 1) * limit
  return {
    page,
    limit,
    skip,
  }
}
