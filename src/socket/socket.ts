import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { UserRole } from '@prisma/client'

import { corsOptions } from '../config/cors.config.js'
import { prisma } from '../lib/prisma.js'
import { socketAuth } from './socketAuth.js'
import { ChatSocketRooms } from '../types/socket.constants.js'

let io: Server

export const initializeSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: corsOptions,
  })

  io.use(socketAuth)

  io.on('connection', async (socket) => {
    try {
      const user = socket.data.user

      console.log(`[Socket Connected] ${user.role} (${user.id}) -> ${socket.id}`)

      if (user.role === UserRole.ADMIN) {
        await socket.join(ChatSocketRooms.ADMIN)

        console.log('[Room Joined] admins')
      }

      if (user.role === UserRole.VENDOR) {
        const vendor = await prisma.vendor.findUnique({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
          },
        })

        if (!vendor) {
          socket.disconnect(true)
          return
        }

        await socket.join(ChatSocketRooms.VENDOR(vendor.id))

        socket.data.vendorId = vendor.id

        console.log(`[Room Joined] vendor:${vendor.id}`)
      }

      socket.on('disconnect', () => {
        console.log(`[Socket Disconnected] ${user.role} (${user.id}) -> ${socket.id}`)
      })
    } catch (error) {
      console.error('Socket connection setup failed:', error)
      socket.disconnect(true)
    }
  })

  return io
}

export const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized')
  }

  return io
}
