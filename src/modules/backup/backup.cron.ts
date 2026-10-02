import { backupQueue } from '../../config/bullmq.config.js'
import { DEFAULT_BACKUP_CRON } from './backup.constant.js'

/**
 * Schedules daily database backup via BullMQ repeatable jobs
 */
export const startBackupCron = async () => {
    try {
        // Clean up existing repeatable jobs in the backup queue to prevent duplicates/old patterns
        const repeatableJobs = await backupQueue.getRepeatableJobs()
        for (const job of repeatableJobs) {
            await backupQueue.removeRepeatableByKey(job.key)
        }

        // Schedule repeatable backup job
        await backupQueue.add(
            'run-backup',
            {},
            {
                repeat: {
                    pattern: DEFAULT_BACKUP_CRON, // '*/1 * * * *'
                    tz: 'Asia/Dhaka',
                },
                jobId: 'daily-db-backup', // Unique key to prevent duplicates
            }
        )
        console.log(`📅 Database backup queue scheduler started: ${DEFAULT_BACKUP_CRON} (Asia/Dhaka)`)
    } catch (error) {
        console.error('❌ Failed to start database backup scheduler:', error)
    }
}