import type { Request, Response } from 'express'

import { CodService } from './cod.service.js'

const placeCODOrder = async (req: Request, res: Response) => {
  const result = await CodService.createCODOrder(req.body)

  res.status(201).json({
    success: true,
    data: result,
  })
}

const updateToProcessing = async (req: Request, res: Response) => {
  const result = await CodService.updateOrderStatus(req.params.id as string, 'PROCESSING')

  res.status(200).json({
    success: true,
    data: result,
  })
}

const updateToShipped = async (req: Request, res: Response) => {
  const result = await CodService.updateOrderStatus(req.params.id as string, 'SHIPPED')

  res.status(200).json({
    success: true,
    data: result,
  })
}

export const CodController = {
  placeCODOrder,
  updateToProcessing,
  updateToShipped,
}
