import status from 'http-status'
import { prisma } from '../../lib/prisma.js'
// import cloudinary from '../../config/cloudinary.js'
import AppError from '../../shared/errors/AppError.js'
import { uploadSingleImage, deleteImageHandler } from './uploadHandler.js'
import { CreateImageValidationType } from './upload.validation.js'
// import { Prisma } from '@prisma/client'
import { calculatePagination } from '../../shared/pagination/pagination.js'
import { TPaginationOptions } from '../../shared/pagination/pagination.types.js'
import { ImageType } from '../../services/storage/image.types.js'
import { ImageCategory } from '@prisma/client'

// Upload Image
const uploadImage = async (payload: CreateImageValidationType, files: Express.Multer.File[]) => {
  // Check how many images already exist
  const existingImageCount = await prisma.image.count({
    where: {
      productId: payload.productId,
      imageCategory: ImageCategory.PRODUCT,
    },
  })

  if (existingImageCount >= 6) {
    throw new AppError(status.BAD_REQUEST, 'This product already has the maximum of 6 images.')
  }

  if (existingImageCount + files.length > 6) {
    throw new AppError(
      status.BAD_REQUEST,
      `You can upload only ${6 - existingImageCount} more image(s).`
    )
  }

  // compress & upload + saving to database
  const uploadedImages = await Promise.all(
    files.map(async (file) => {
      const uploadedFile = await uploadSingleImage(file, 'products', ImageType.PRODUCT)

      return prisma.image.create({
        data: {
          productId: payload.productId,

          imageCategory: ImageCategory.PRODUCT,
          imageName: uploadedFile.imageName,
          imageKey: uploadedFile.imageKey,
          imageUrl: uploadedFile.imageUrl,

          width: uploadedFile.width,
          height: uploadedFile.height,
          size: uploadedFile.size,
          mimeType: uploadedFile.mimeType,
        },
      })
    })
  )

  return uploadedImages
}

/**
 * Upload General Image (without saving to db)
 */
const uploadGeneralImage = async (file: Express.Multer.File) => {
  const uploadedFile = await uploadSingleImage(file, 'products', ImageType.PRODUCT)
  return {
    imageUrl: uploadedFile.imageUrl,
    imageName: uploadedFile.imageName,
  }
}

/**
 * upload admin avatar
 */

const uploadAdminAvatar = async (file: Express.Multer.File) => {
  if (!file) {
    throw new AppError(400, 'No image provided')
  }

  const uploadedImage = await uploadSingleImage(file, 'admin', ImageType.AVATAR)
  return uploadedImage
}

/**
 * upload vendor avatar & shopLogo
 */

const uploadVendorImages = async (files: {
  avatar?: Express.Multer.File[]
  shopLogo?: Express.Multer.File[]
}) => {
  const avatarFile = files.avatar?.[0]
  const shopLogoFile = files.shopLogo?.[0]

  const result: {
    avatar?: {
      imageUrl: string
      imageKey: string
    }
    shopLogo?: {
      imageUrl: string
      imageKey: string
    }
  } = {}

  if (avatarFile) {
    result.avatar = await uploadSingleImage(avatarFile, 'avatar', ImageType.AVATAR)
  }

  if (shopLogoFile) {
    result.shopLogo = await uploadSingleImage(shopLogoFile, 'shop_logo', ImageType.SHOP_LOGO)
  }

  return result
}
/**
 * Get All Images
 */

const getAllImages = async (options: TPaginationOptions) => {
  const { page, limit, skip } = calculatePagination(options)
  const total = await prisma.image.count()

  const result = await prisma.image.findMany({
    skip,
    take: limit,

    select: {
      id: true,
      ImageCategory: true,
      imageName: true,
      imageUrl: true,
      imageKey: true,
      createdAt: true,
      updatedAt: true,

      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },

    orderBy: {
      createdAt: 'desc',
    },
  })

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },

    data: result,
  }
}

/**
 * Get Product Related Images
 */

const getProductRelatedImages = async (productId: string) => {
  // Check Product Exists
  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },

    select: {
      id: true,
      name: true,
    },
  })

  if (!product) {
    throw new AppError(status.NOT_FOUND, 'Product not found')
  }

  const productImages = await prisma.image.findMany({
    where: {
      productId,
      imageCategory: ImageCategory.PRODUCT,
    },
  })

  const maliciousImages = await prisma.image.findMany({
    where: {
      productId,
      imageCategory: ImageCategory.MALICIOUS,
    },
  })

  return {
    product,
    productImages,
    maliciousImages,
    totalProductImages: productImages.length,
    totalMaliciousImages: maliciousImages.length,
  }
}

/**
 * Get Single Image
 */

const getSingleImage = async (id: string) => {
  const result = await prisma.image.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      productId: true,
      imageCategory: true,
      imageName: true,
      imageUrl: true,
      imageKey: true,

      width: true,
      height: true,
      size: true,
      mimeType: true,

      createdAt: true,
      updatedAt: true,

      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!result) {
    throw new AppError(status.NOT_FOUND, 'Image not found')
  }

  return result
}

/**
 * Update Image
 */

const replaceImage = async (id: string, file: Express.Multer.File) => {
  // Check image exists
  const image = await prisma.image.findUnique({
    where: {
      id,
    },
  })

  if (!image) {
    throw new AppError(status.NOT_FOUND, 'Image not found')
  }

  // Upload new image
  const uploaded = await uploadSingleImage(file, 'products', ImageType.PRODUCT)

  // Update database
  const result = await prisma.image.update({
    where: {
      id,
    },
    data: {
      imageName: uploaded.imageName,
      imageUrl: uploaded.imageUrl,
      imageKey: uploaded.imageKey,

      width: uploaded.width,
      height: uploaded.height,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
    },
  })

  // Delete old image from R2
  try {
    await deleteImage(image.imageKey)
  } catch (error) {
    console.error('Failed to delete old image:', error)
  }

  return result
}

/**
 * Delete Image
 */

const deleteImage = async (id: string) => {
  // Find image
  const image = await prisma.image.findUnique({
    where: {
      id,
    },
  })

  if (!image) {
    throw new AppError(status.NOT_FOUND, 'Image not found')
  }

  // Delete from R2
  try {
    await deleteImageHandler(image.imageKey)
  } catch (error) {
    console.error('Failed to delete image from R2:', error)
    throw new AppError(status.INTERNAL_SERVER_ERROR, 'Failed to delete image from storage')
  }

  // Delete from database
  await prisma.image.delete({
    where: {
      id,
    },
  })

  return null
}

// common image uploader api
const commonImageUploader = async (
  payload: CreateImageValidationType,
  files: Express.Multer.File[]
) => {
  // Check how many images already exist
  const existingImageCount = await prisma.image.count({
    where: {
      productId: payload.productId,
      imageCategory: ImageCategory.MALICIOUS,
    },
  })

  if (existingImageCount >= 10) {
    throw new AppError(status.BAD_REQUEST, 'This product already has the maximum of 10 images.')
  }

  if (existingImageCount + files.length > 10) {
    throw new AppError(
      status.BAD_REQUEST,
      `You can upload only ${10 - existingImageCount} more image(s).`
    )
  }

  // compress & upload + saving to database
  const uploadedImages = await Promise.all(
    files.map(async (file) => {
      const uploadedFile = await uploadSingleImage(file, 'malicious', ImageType.MALICIOUS)

      return prisma.image.create({
        data: {
          productId: payload.productId,

          imageCategory: ImageCategory.MALICIOUS,
          imageName: uploadedFile.imageName,
          imageKey: uploadedFile.imageKey,
          imageUrl: uploadedFile.imageUrl,

          width: uploadedFile.width,
          height: uploadedFile.height,
          size: uploadedFile.size,
          mimeType: uploadedFile.mimeType,
        },
      })
    })
  )

  return uploadedImages
}

export const UploadService = {
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
