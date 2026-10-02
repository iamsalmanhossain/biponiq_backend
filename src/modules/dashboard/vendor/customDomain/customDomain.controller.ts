import { Request, Response } from 'express'

import { StatusCodes } from 'http-status-codes'

import catchAsync from '../../../../shared/utils/catchAsync.js'
import { CustomDomainService } from './customDomain.service.js'
import { sendResponse } from '../../../../shared/utils/sendResponse.js'

// add domain to vendor
const addDomain = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id // টোকেন থেকে আসা User ID
  const { domain } = req.body

  if (!domain) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Domain is required',
    })
  }

  // সার্ভিস ফাংশনে userId পাস করুন
  const result = await CustomDomainService.addCustomDomain(userId, domain)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Domain added successfully. Please configure your DNS.',
    data: result,
  })
})

// verify domain for vendor

const verifyDomain = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id
  const result = await CustomDomainService.verifyCustomDomain(userId)

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Domain connected successfully!',
    data: result,
  })
})

// delete custom domain

const deleteDomain =catchAsync(async(req:Request, res:Response)=>{
    const userId=req.user.id
    const result = await CustomDomainService.deleteCustomDomain(userId)
    sendResponse(res, {
        statusCode:StatusCodes.OK,
        success:true,
        message:'Custom domain deleted successfully',
        data:result,
    })
})

// get custom domain

const getCustomDomain=catchAsync(async(req:Request, res:Response)=>{
    const userId= req.user.id
    const result = await CustomDomainService.getCustomDomain(userId)
    sendResponse(res, {
        statusCode:StatusCodes.OK,
        success: true,
        message: 'Custom domain retrieved successfully',
        data: result
    })
})

export const CustomDomainController = {
  addDomain,
  verifyDomain,
  deleteDomain,
  getCustomDomain,
}
