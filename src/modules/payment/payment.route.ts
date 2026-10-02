import { Router } from 'express'
import { PaymentController } from './payment.controller.js'

const router: Router = Router()

// SSLCommerz callbacks
router.post('/sslcommerz/success', PaymentController.paymentSuccess)
router.post('/sslcommerz/fail', PaymentController.paymentFail)
router.post('/sslcommerz/cancel', PaymentController.paymentCancel)
router.post('/sslcommerz/ipn', PaymentController.paymentIpn)

// EPS browser returns
router.get('/eps/success', PaymentController.epsPaymentSuccess)
router.get('/eps/fail', PaymentController.epsPaymentFail)
router.get('/eps/cancel', PaymentController.epsPaymentCancel)
router.post('/eps/ipn', PaymentController.epsPaymentIpn)

// Legacy SSLCommerz callback aliases
router.post('/success', PaymentController.paymentSuccess)
router.post('/fail', PaymentController.paymentFail)
router.post('/cancel', PaymentController.paymentCancel)
router.post('/ipn', PaymentController.paymentIpn)

export const PaymentRoutes = router
