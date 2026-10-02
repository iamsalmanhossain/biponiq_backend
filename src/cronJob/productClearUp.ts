import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'
import { cleanupSoftDeletedRecords } from './cronClearUp.js'

const THREE_DAYS_IN_SECONDS = 3 * 24 * 60 * 60

export const startProductCleanupJob = () => {

  cron.schedule(
    '0 2 * * *',
    async () => {
        try {
        
        await cleanupSoftDeletedRecords(
          prisma.product,
          THREE_DAYS_IN_SECONDS,
          {
            orderItems: { none: {} }
          }
        )
        
      } catch (error: any) {
        if (error?.code === 'P1001') {
          console.warn('[Cron] Database is currently unreachable (P1001). Will retry Product cleanup in the next cycle.');
        } else {
          console.error('[CRON ERROR]', error)
        }
      }
    },
    {
      timezone: 'Asia/Dhaka',
    }
  )
}