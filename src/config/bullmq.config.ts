import { Queue, Worker } from 'bullmq'
import redis from './redis.config.js'

// Reuse shared Redis connection for BullMQ
export const visitorQueue = new Queue('visitor-tracking', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3, // If the job fails, retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000, // Start with 1 second delay
    },
    removeOnComplete: true, // Remove job after success to save memory
    removeOnFail: 1000, // Keep last 1000 failed jobs for debugging
  },
})

export const emailQueue = new Queue('email-sending', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  }
})

export const backupQueue = new Queue('database-backup', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  }
})

export const redisConnection = redis as any

