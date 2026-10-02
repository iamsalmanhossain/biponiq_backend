import express, { type Application, type Request, type Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import router from './routes/routes.js'
import globalErrorHandler from './middleware/globalErrorHandler.js'
import swaggerDocument from './config/swagger.js'
import { notFound } from './middleware/notFound.js'
import { getSwaggerHtml } from './utils/swaggerHtml.js'
import { startVendorCleanupJob } from './cronJob/vendorClearUp.js'
import { startProductCleanupJob } from './cronJob/productClearUp.js'
import { initOtpCleanupCron } from './cronJob/otpCleanupTask.js'
import { initPixelEventCron } from './cronJob/pixelEventCron.js'
import { startBackupCron } from './modules/backup/backup.cron.js'
import './workers/email.worker.js'
import './workers/backup.worker.js'
import { corsOptions } from './config/cors.config.js'
import { createRequire } from 'module'
import { ExpressAdapter } from '@bull-board/express'
import { visitorQueue, emailQueue, backupQueue } from './config/bullmq.config.js'

const require = createRequire(import.meta.url)
const { createBullBoard } = require('@bull-board/api')
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter')

const app: Application = express()

// Trust proxy is required to get the real IP behind Vercel/Cloudflare/Nginx
// Using '1' instead of 'true' to fix express-rate-limit ERR_ERL_PERMISSIVE_TRUST_PROXY error
app.set('trust proxy', 1)

// const router = Router()

// app.listen(5000)

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Server is running successfully',
  })
})

app.use('/api/v1', router)
// app.use("/api/v1/vendor", VendorRoutes);
startVendorCleanupJob()
startProductCleanupJob()
initOtpCleanupCron()
initPixelEventCron()
startBackupCron()
app.get('/api-docs', (req: Request, res: Response) => {
  res.send(getSwaggerHtml(swaggerDocument))
})

// Bull Board Dashboard - Queue monitoring UI
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')
createBullBoard({
  queues: [
    new BullMQAdapter(visitorQueue),
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(backupQueue)
  ],
  serverAdapter,
})
app.use('/admin/queues', serverAdapter.getRouter())

app.use(notFound)
app.use(globalErrorHandler)

export default app
