import type { Request, Response } from 'express'
import status from 'http-status'

import { ApiResponse } from '../../../shared/utils/ApiResponse.js'
import catchAsync from '../../../shared/utils/catchAsync.js'
import { DomainAvailabilityService } from './domainAvailability.service.js'

const checkDomainAvailability = catchAsync(async (req: Request, res: Response) => {
  const result = await DomainAvailabilityService.checkDomainAvailability(req.body)

  ApiResponse.success(res, result, 'Domain availability retrieved successfully', status.OK)
})

export const DomainAvailabilityController = {
  checkDomainAvailability,
}
