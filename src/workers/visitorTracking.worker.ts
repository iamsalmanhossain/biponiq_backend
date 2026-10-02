import { Worker } from 'bullmq'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { redisConnection } from '../config/bullmq.config.js'

// This worker listens to the 'visitor-tracking' queue and processes each job
export const visitorWorker = new Worker(
  'visitor-tracking',
  async (job) => {
    const visitorData = job.data
    const trackingId =
      typeof visitorData.trackingId === 'string' && visitorData.trackingId.length > 0
        ? visitorData.trackingId
        : `bullmq:${job.id}`

    try {
      await prisma.visitorTracking.create({
        data: {
          id: trackingId,
          vendorId: visitorData.vendorId,
          ip: visitorData.ip || null,
          country: visitorData.country || '',
          city: visitorData.city || '',
          userAgent: visitorData.userAgent || null,
        },
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error
      }

      const persistedTracking = await prisma.visitorTracking.findUnique({
        where: { id: trackingId },
        select: { vendorId: true },
      })

      if (persistedTracking?.vendorId !== visitorData.vendorId) {
        throw error
      }
    }

    console.log(`[BullMQ] Visitor log saved for vendorId: ${visitorData.vendorId}`)
  },
  {
    connection: redisConnection,
    concurrency: 10, // Process up to 10 visitor logs simultaneously
  }
)

visitorWorker.on('completed', (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully.`)
})

visitorWorker.on('failed', (job, err) => {
  console.error(`[BullMQ] Job ${job?.id} failed with error:`, err.message)
})
