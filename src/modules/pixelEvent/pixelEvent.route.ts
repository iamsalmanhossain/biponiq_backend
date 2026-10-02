import express, { Router } from 'express'
import { PixelEventController } from './pixelEvent.controller.js'
import { authenticate } from '../../middleware/authinticate.js'

const router = express.Router()

router.post('/:vendorId/track', PixelEventController.trackEvent)
router.get('/stats', authenticate, PixelEventController.getEventStats)

export const PixelEventRoutes: Router = router
