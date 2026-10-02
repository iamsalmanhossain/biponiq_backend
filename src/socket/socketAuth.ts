import type { Socket } from 'socket.io'

import { verifyAccessToken } from '../shared/utils/verifyAccessToken.js'

export const socketAuth = (socket: Socket, next: (error?: Error) => void) => {
  try {
    const authToken = socket.handshake.auth?.token

    const authorizationHeader = socket.handshake.headers.authorization

    const headerToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.split(' ')[1]
      : undefined

    const token = authToken || headerToken

    if (!token) {
      return next(new Error('Token not provided'))
    }

    const user = verifyAccessToken(token)

    socket.data.user = user

    next()
  } catch {
    next(new Error('Invalid or expired token'))
  }
}
