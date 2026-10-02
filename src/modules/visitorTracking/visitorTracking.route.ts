import express, { Router } from 'express'
import { VisitorTrackingController } from './visitorTracking.controller.js'
import { authenticate } from '../../middleware/authinticate.js'

const router: Router = express.Router()

// Track visitor (public)
router.post('/:subDomain/track', VisitorTrackingController.trackVisitor)

// Get visitor stats for vendor dashboard (protected)
router.get('/stats', authenticate, VisitorTrackingController.getVisitorStats)

// Get current-cycle visitor quota metadata for vendor dashboard (protected)
router.get('/quota', authenticate, VisitorTrackingController.getVisitorQuota)

export const VisitorTrackingRoutes = router
