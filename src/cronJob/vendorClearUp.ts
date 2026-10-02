import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'
import { cleanupSoftDeletedRecords } from './cronClearUp.js'

export const startVendorCleanupJob = () => {
  cron.schedule(
    '0 1 * * *',
    async () => {
      try {
        await cleanupSoftDeletedRecords(prisma.user, 30 * 24 * 60 * 60, {
          role: 'VENDOR',
        })
      } catch (error) {
        console.error('[CRON ERROR]', error)
      }
    },
    {
      timezone: 'Asia/Dhaka',
    }
  )
}
