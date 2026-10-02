import { Worker } from 'bullmq'
import { redisConnection } from '../config/bullmq.config.js'
import { BackupService } from '../modules/backup/backup.service.js'

export const backupWorker = new Worker(
  'database-backup',
  async (job) => {
    try {
      const result = await BackupService.createBackup()
      console.log('✅ Database backup completed successfully via BullMQ worker.')
      return result
    } catch (error) {
      console.error('❌ Database backup job failed in BullMQ worker.')
      throw error
    }
  },
  { connection: redisConnection }
)

backupWorker.on('failed', (job, err) => {
  console.error(`Backup job ${job?.id} failed:`, err.message)
})
