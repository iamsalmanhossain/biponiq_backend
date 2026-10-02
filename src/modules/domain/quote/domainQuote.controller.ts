import type { Request, Response } from 'express'
import status from 'http-status'

import { ApiResponse } from '../../../shared/utils/ApiResponse.js'
import catchAsync from '../../../shared/utils/catchAsync.js'
import { DomainQuoteService } from './domainQuote.service.js'

const getDomainQuote = catchAsync(async (req: Request, res: Response) => {
  const result = await DomainQuoteService.getVendorDomainQuote(req.body.domain)

  ApiResponse.success(res, result, 'Domain quote retrieved successfully', status.OK)
})

export const DomainQuoteController = {
  getDomainQuote,
}
