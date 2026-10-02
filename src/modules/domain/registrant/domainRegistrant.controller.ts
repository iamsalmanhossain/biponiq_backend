import type { Request, Response } from 'express'
import httpStatus from 'http-status'

import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import { ApiResponse } from '../../../shared/utils/ApiResponse.js'
import catchAsync from '../../../shared/utils/catchAsync.js'

import { DomainRegistrantService } from './domainRegistrant.service.js'

const getAuthVendorId = async (req: Request) => {
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized vendor')
  }

  const vendor = await prisma.vendor.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor profile not found')
  }

  return vendor.id
}

const getMyDomainRegistrant = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await DomainRegistrantService.getVendorDomainRegistrant(vendorId)

  ApiResponse.success(
    res,
    result,
    'Domain registrant profile retrieved successfully',
    httpStatus.OK
  )
})

const saveMyDomainRegistrant = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await DomainRegistrantService.saveVendorDomainRegistrant(vendorId, req.body)

  ApiResponse.success(res, result, 'Domain registrant profile saved successfully', httpStatus.OK)
})

const confirmMyDomainRegistrant = catchAsync(async (req: Request, res: Response) => {
  const vendorId = await getAuthVendorId(req)

  const result = await DomainRegistrantService.confirmVendorDomainRegistrant(vendorId, req.body)

  ApiResponse.success(
    res,
    result,
    'Domain registrant profile confirmed successfully',
    httpStatus.OK
  )
})

export const DomainRegistrantController = {
  getMyDomainRegistrant,
  saveMyDomainRegistrant,
  confirmMyDomainRegistrant,
}
