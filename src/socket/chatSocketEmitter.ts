import { UserRole } from '@prisma/client'
import { getSocketIO } from './socket.js'
import { ChatSocketEvents, ChatSocketRooms } from '../types/socket.constants.js'

type NewMessagePayload = {
  vendorId: string
  [key: string]: unknown
}

type ConversationSeenPayload = {
  conversationId: string
  vendorId: string
  updatedCount: number
  seenAt: Date
  seenByRole: UserRole
  seenMessageSenderRole: UserRole
}

export const emitNewChatMessage = (payload: NewMessagePayload) => {
  try {
    const io = getSocketIO()

    io.to(ChatSocketRooms.ADMIN)
      .to(ChatSocketRooms.VENDOR(payload.vendorId))
      .emit(ChatSocketEvents.NEW_MESSAGE, payload)
  } catch (error) {
    console.error('Failed to emit new chat message:', error)
  }
}

export const emitConversationSeen = (payload: ConversationSeenPayload) => {
  if (payload.updatedCount === 0) {
    return
  }

  try {
    const io = getSocketIO()

    io.to(ChatSocketRooms.ADMIN)
      .to(ChatSocketRooms.VENDOR(payload.vendorId))
      .emit(ChatSocketEvents.CONVERSATION_SEEN, payload)
  } catch (error) {
    console.error('Failed to emit conversation seen event:', error)
  }
}
