import { createServer } from 'http'

import app from './app.js'
import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'
import './workers/visitorTracking.worker.js'
import './workers/backup.worker.js'
import './workers/domainRegistration.worker.js'
import './workers/email.worker.js'
import { initializeSocket } from './socket/socket.js'
import { startQuotaRecoveryListener } from './modules/visitorTracking/visitorTracking.quota.recovery.js'

let server: ReturnType<typeof createServer>

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  process.exit(1)
})

async function bootstrap() {
  try {
    server = createServer(app)

    initializeSocket(server)

    startQuotaRecoveryListener()

    server.listen(env.PORT, () => {
      console.log(`Server is running on port ${env.PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

;(async () => {
  await bootstrap()
})()

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error)

  if (server) {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(1)
    })
  } else {
    process.exit(1)
  }
})

process.on('SIGTERM', () => {
  if (server) {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  } else {
    process.exit(0)
  }
})

process.on('SIGINT', () => {
  if (server) {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  } else {
    process.exit(0)
  }
})
