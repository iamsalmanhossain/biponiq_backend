import type { Request, Response } from 'express'
import status from 'http-status'
import catchAsync from '../../shared/utils/catchAsync.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import AppError from '../../shared/errors/AppError.js'
import { UploadService } from './upload.service.js'
import { CreateImageValidationType } from './upload.validation.js'

// Upload Image
const uploadImage = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[]

  // Check File
  if (!files || files.length === 0) {
    throw new AppError(status.BAD_REQUEST, 'No images uploaded')
  }

  // Get Body Data
  const payload = req.body as CreateImageValidationType

  // Upload Image
  const result = await UploadService.uploadImage(payload, files)

  sendResponse(res, {
    statusCode: status.CREATED,
    success: true,
    message: 'Image uploaded successfully',
    data: result,
  })
})

/**
 * admin avatar upload
 */
const uploadAdminAvatar = catchAsync(async (req: Request, res: Response) => {
  const result = await UploadService.uploadAdminAvatar(req.file as Express.Multer.File)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Avatar uploaded successfully',
    data: result,
  })
})

/**
 * vendor avatar & shopLogo upload
 */

const uploadVendorImages = catchAsync(async (req, res) => {
  const files = req.files as {
    avatar?: Express.Multer.File[]
    shopLogo?: Express.Multer.File[]
  }

  const result = await UploadService.uploadVendorImages(files)
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Images uploaded successfully',
    data: result,
  })
})

/**
 * Upload General Image
 */
const uploadGeneralImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(status.BAD_REQUEST, 'Image file is required')
  }

  const result = await UploadService.uploadGeneralImage(req.file)

  sendResponse(res, {
    statusCode: status.CREATED,
    success: true,
    message: 'General image uploaded successfully',
    data: result,
  })
})

/**
 * Get All Images
 */
const getAllImages = catchAsync(async (req: Request, res: Response) => {
  const result = await UploadService.getAllImages(req.query)

  sendResponse(res, {
    statusCode: status.OK,
    success: true,
    message: 'Images retrieved successfully',
    data: result.data,
    meta: result.meta,
  })
})

/**
 * Get Product Related Images
 */

const getProductRelatedImages = catchAsync(async (req: Request, res: Response) => {
  const productId = req.params.id as string

  if (!productId) {
    throw new AppError(status.BAD_REQUEST, 'Product id is required')
  }

  const result = await UploadService.getProductRelatedImages(productId)

  sendResponse(res, {
    statusCode: status.OK,
    success: true,
    message: 'Product all images retrieved successfully',
    data: result,
  })
})

/**
 * Get Single Image
 */

const getSingleImage = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string

  if (!id) {
    throw new AppError(status.BAD_REQUEST, 'Image id is required')
  }

  const result = await UploadService.getSingleImage(id)

  sendResponse(res, {
    statusCode: status.OK,
    success: true,
    message: 'Image retrieved successfully',
    data: result,
  })
})

/**
 * Update/replace Image
 */

const replaceImage = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string

  if (!req.file) {
    throw new AppError(status.BAD_REQUEST, 'Image file is required')
  }

  const result = await UploadService.replaceImage(id, req.file)

  sendResponse(res, {
    statusCode: status.OK,
    success: true,
    message: 'Image replaced successfully',
    data: result,
  })
})

/**
 * Delete Image
 */

const deleteImage = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string

  if (!id) {
    throw new AppError(status.BAD_REQUEST, 'Image id is required')
  }

  await UploadService.deleteImage(id)

  sendResponse(res, {
    statusCode: status.OK,
    success: true,
    message: 'Image deleted successfully',
    data: null,
  })
})

// common image upload api
const commonImageUploader = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[]

  // Check File
  if (!files || files.length === 0) {
    throw new AppError(status.BAD_REQUEST, 'No images uploaded')
  }

  // Get Body Data
  const payload = req.body as CreateImageValidationType

  // Upload Image
  const result = await UploadService.commonImageUploader(payload, files)

  sendResponse(res, {
    statusCode: status.CREATED,
    success: true,
    message: 'Image uploaded successfully',
    data: result,
  })
})

export const uploadController = {
  uploadImage,
  getAllImages,
  getProductRelatedImages,
  getSingleImage,
  replaceImage,
  deleteImage,
  uploadGeneralImage,
  uploadAdminAvatar,
  uploadVendorImages,
  commonImageUploader,
}
