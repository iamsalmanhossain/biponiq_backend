import { Router } from 'express'
import { LocationController } from './location.controller.js'

const router: Router = Router()

router.get('/divisions', LocationController.getDivisions)
router.get('/districts', LocationController.getDistricts)

export const LocationRoutes = router
