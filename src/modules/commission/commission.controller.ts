import { Request, Response } from 'express'
import { CommissionService } from './commission.service.js'

const calculateCommission = async (req: Request, res: Response) => {
  const { totalAmount, commissionRate } = req.body

  const result = CommissionService.calculateCommission(totalAmount, commissionRate)

  res.status(200).json({
    success: true,
    data: result,
  })
}

export const CommissionController = {
  calculateCommission,
}
