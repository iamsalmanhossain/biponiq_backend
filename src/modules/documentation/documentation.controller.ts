import { Request, Response } from 'express'
import httpStatus from 'http-status'

import catchAsync from '../../shared/utils/catchAsync.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import { DocumentationService } from './documentation.service.js'

const createDocumentation = catchAsync(async (req: Request, res: Response) => {
  const result = await DocumentationService.createDocumentation(req.body)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Documentation created successfully',
    data: result,
  })
})

const getAllDocumentationsForAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await DocumentationService.getAllDocumentationsForAdmin(req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documentations retrieved successfully',
    data: result,
  })
})

const getAllDocumentationsForVendor = catchAsync(async (req: Request, res: Response) => {
  const result = await DocumentationService.getAllDocumentationsForVendor()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documentations retrieved successfully',
    data: result,
  })
})

const getSingleDocumentation = catchAsync(async (req: Request, res: Response) => {
  const { title } = req.params
  const result = await DocumentationService.getSingleDocumentation(title as string)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documentation retrieved successfully',
    data: result,
  })
})

const updateDocumentation = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const result = await DocumentationService.updateDocumentation(id as string, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documentation updated successfully',
    data: result,
  })
})

const deleteDocumentation = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const result = await DocumentationService.deleteDocumentation(id as string)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documentation deleted successfully',
    data: result,
  })
})

export const DocumentationController = {
  createDocumentation,
  getAllDocumentationsForAdmin,
  getAllDocumentationsForVendor,
  getSingleDocumentation,
  updateDocumentation,
  deleteDocumentation,
}
