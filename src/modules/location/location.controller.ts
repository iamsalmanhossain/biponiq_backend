import { Request, Response } from 'express'
import catchAsync from '../../shared/utils/catchAsync.js'
import { LocationService } from './location.service.js'

export const LocationController = {
  getDivisions: catchAsync(async (req: Request, res: Response) => {
    const divisions = await LocationService.getAllDivisions()

    res.status(200).json({
      success: true,
      data: divisions,
    })
  }),

  getDistricts: catchAsync(async (req: Request, res: Response) => {
    const { divisionId } = req.query
    const districts = await LocationService.getDistricts(divisionId as string)

    res.status(200).json({
      success: true,
      data: districts,
    })
  }),
}
