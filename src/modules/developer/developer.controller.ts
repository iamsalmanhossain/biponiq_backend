import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../shared/utils/catchAsync.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import { DeveloperService } from './developer.service.js'
import { uploadSingleImage } from '../upload/uploadHandler.js'
import { ImageType } from '../../services/storage/image.types.js'
import AppError from '../../shared/errors/AppError.js'
import { DeveloperValidation } from './developer.validation.js'

// Admin Developer Page

const createDeveloperPage = catchAsync(async (req: Request, res: Response) => {
  const result = await DeveloperService.createDeveloperPage(req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Developer page created successfully',
    data: result,
  })
})

const getDeveloperPagesForAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await DeveloperService.getDeveloperPagesForAdmin()
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer pages retrieved successfully',
    data: result,
  })
})

const getDeveloperPageById = catchAsync(async (req: Request, res: Response) => {
  const pageId = req.params.pageId as string
  const result = await DeveloperService.getDeveloperPageById(pageId)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer page retrieved successfully',
    data: result,
  })
})

const updateDeveloperPage = catchAsync(async (req: Request, res: Response) => {
  const pageId = req.params.pageId as string
  const result = await DeveloperService.updateDeveloperPage(pageId, req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer page updated successfully',
    data: result,
  })
})

const deleteDeveloperPage = catchAsync(async (req: Request, res: Response) => {
  const pageId = req.params.pageId as string
  const result = await DeveloperService.deleteDeveloperPage(pageId)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer page deleted successfully',
    data: result,
  })
})

// Admin Developer

const createDeveloper = catchAsync(async (req: Request, res: Response) => {
  const result = await DeveloperService.createDeveloper(req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Developer created successfully',
    data: result,
  })
})

const getDevelopersForAdmin = catchAsync(async (req: Request, res: Response) => {
  const query = DeveloperValidation.adminDeveloperQuerySchema.parse(req.query)

  const result = await DeveloperService.getDevelopersForAdmin(query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developers retrieved successfully',
    data: result,
  })
})

const getDeveloperById = catchAsync(async (req: Request, res: Response) => {
  const developerId = req.params.developerId as string
  const result = await DeveloperService.getDeveloperById(developerId)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer retrieved successfully',
    data: result,
  })
})

const updateDeveloper = catchAsync(async (req: Request, res: Response) => {
  const developerId = req.params.developerId as string
  const result = await DeveloperService.updateDeveloper(developerId, req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer updated successfully',
    data: result,
  })
})

const deleteDeveloper = catchAsync(async (req: Request, res: Response) => {
  const developerId = req.params.developerId as string
  const result = await DeveloperService.deleteDeveloper(developerId)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer deleted successfully',
    data: result,
  })
})

// Admin Developer Image

const updateDeveloperImage = catchAsync(async (req: Request, res: Response) => {
  const developerId = req.params.developerId as string

  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Please upload an image')
  }

  const uploadedImage = await uploadSingleImage(req.file, 'avatar', ImageType.AVATAR)

  const result = await DeveloperService.updateDeveloperImage(developerId, {
    imageUrl: uploadedImage.imageUrl,
    imageKey: uploadedImage.imageKey,
  })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer image updated successfully',
    data: result,
  })
})

const removeDeveloperImage = catchAsync(async (req: Request, res: Response) => {
  const developerId = req.params.developerId as string
  const result = await DeveloperService.removeDeveloperImage(developerId)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer image removed successfully',
    data: result,
  })
})

// Public

const getAllDevelopers = catchAsync(async (req: Request, res: Response) => {
  const result = await DeveloperService.getAllDevelopers()
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developers retrieved successfully',
    data: result,
  })
})

const getPublicDeveloperPages = catchAsync(async (req: Request, res: Response) => {
  const result = await DeveloperService.getPublicDeveloperPages()
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer pages retrieved successfully',
    data: result,
  })
})

const getDevelopersByPageSlug = catchAsync(async (req: Request, res: Response) => {
  const slug = req.params.slug as string
  const result = await DeveloperService.getDevelopersByPageSlug(slug)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Developer page retrieved successfully',
    data: result,
  })
})

export const DeveloperController = {
  createDeveloperPage,
  getDeveloperPagesForAdmin,
  getDeveloperPageById,
  updateDeveloperPage,
  deleteDeveloperPage,
  createDeveloper,
  getDevelopersForAdmin,
  getDeveloperById,
  updateDeveloper,
  deleteDeveloper,
  updateDeveloperImage,
  removeDeveloperImage,
  getAllDevelopers,
  getPublicDeveloperPages,
  getDevelopersByPageSlug,
}
