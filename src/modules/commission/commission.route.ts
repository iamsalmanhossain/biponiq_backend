import express, { type Router } from 'express'
import { validateSchema } from '../../middleware/validateRequest.js'
import { calculateCommissionValidationSchema } from './commission.validation.js'
import { CommissionController } from './commission.controller.js'

const router: Router = express.Router()

router.post(
  '/calculate',
  validateSchema(calculateCommissionValidationSchema),
  CommissionController.calculateCommission
)

export const CommissionRoutes = router
