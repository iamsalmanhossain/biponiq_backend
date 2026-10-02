import { Worker } from 'bullmq'
import { redisConnection } from '../config/bullmq.config.js'
import { transporter } from '../shared/utils/sendEmail.js'
import { env } from '../config/env.js'

export const emailWorker = new Worker('email-sending', async (job) => {
  const { to, subject, html } = job.data
  await transporter.sendMail({
    from: {
      name: 'Biponiq',
      address: env.SMTP_USER as string,
    },
    to,
    subject,
    html,
  })
}, { connection: redisConnection })

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed:`, err.message)
})
