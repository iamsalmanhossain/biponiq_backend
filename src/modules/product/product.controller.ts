import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../shared/utils/catchAsync.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import { ProductService } from './product.service.js'
import type { CreateProduct, UpdateProduct } from './product.validation.js'
import type { ProductParams } from './product.types.js'
import AppError from '../../shared/errors/AppError.js'
import { calculatePagination } from '../../shared/pagination/pagination.js'
import { calculateFilters } from '../../shared/filter/filter.js'
import { calculateAdminProductFilters } from '../../shared/filter/filter.types.js'
import { ProductStatus } from '@prisma/client'

const getProductId = (req: Request): string => {
  const id = req.params?.id as string
  if (!id) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Product ID is required')
  }
  return id
}

const createProduct = catchAsync(
  async (req: Request<object, object, CreateProduct>, res: Response) => {
    const userId = req.user?.id

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized')
    }

    const result = await ProductService.createProduct(req.body, userId)

    ApiResponse.success(res, result, 'Product created successfully', httpStatus.CREATED)
  }
)

const getProductsByAdmin = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, status, isDeleted, phone } = req.query

  const filters = calculateAdminProductFilters({
    status: status as string,
    isDeleted: isDeleted as string,
    phone: phone as string,
  })

  const pagination = calculatePagination({
    page: page as string,
    limit: limit as string,
  })

  const result = await ProductService.getProductsByAdmin(filters, pagination)

  ApiResponse.success(res, result, 'Products retrieved successfully')
})

const getPublicProducts = catchAsync(async (req: Request, res: Response) => {
  const paginationOptions = {
    page: req.query.page as string,
    limit: req.query.limit as string,
  }

  const filterOptions = {
    search: req.query.search as string,
    minPrice: req.query.minPrice as string,
    maxPrice: req.query.maxPrice as string,
    subDomain: req.query.subDomain as string,
    identifier: req.query.identifier as string,
  }

  const pagination = calculatePagination(paginationOptions)
  const filters = calculateFilters(filterOptions)

  const result = await ProductService.getPublicProducts(filters, pagination)

  ApiResponse.success(res, result, 'Public products retrieved successfully')
})

const getVendorProducts = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized')
  }

  const filters = {
    status: req.query.status as ProductStatus,
  }

  const result = await ProductService.getVendorProducts(userId, filters)

  ApiResponse.success(res, result, 'Vendor products retrieved successfully')
})

const getProduct = catchAsync(async (req: Request<Partial<ProductParams>>, res: Response) => {
  const id = getProductId(req)

  const result = await ProductService.getProduct(id)

  ApiResponse.success(res, result, 'Product retrieved successfully')
})

const updateProduct = catchAsync(
  async (req: Request<Partial<ProductParams>, object, UpdateProduct>, res: Response) => {
    const id = getProductId(req)

    const result = await ProductService.updateProduct(id, req.body)

    ApiResponse.success(res, result, 'Product updated successfully')
  }
)

const restoreProductByAdmin = catchAsync(
  async (req: Request<Partial<ProductParams>>, res: Response) => {
    const id = getProductId(req)

    const result = await ProductService.restoreProductByAdmin(id)

    ApiResponse.success(res, result, 'Product restored successfully')
  }
)

const deleteProduct = catchAsync(async (req: Request<Partial<ProductParams>>, res: Response) => {
  const id = getProductId(req)

  const result = await ProductService.deleteProduct(id)

  ApiResponse.success(res, result, 'Product deleted successfully')
})

export const ProductController = {
  createProduct,
  getProductsByAdmin,
  getPublicProducts,
  getVendorProducts,
  getProduct,
  updateProduct,
  restoreProductByAdmin,
  deleteProduct,
}
