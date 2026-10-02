export const ADMIN_ROOM = 'admins'

export const ChatSocketRooms = {
  ADMIN: ADMIN_ROOM,
  VENDOR: (vendorId: string) => `vendor:${vendorId}`,
} as const

export const ChatSocketEvents = {
  NEW_MESSAGE: 'chat:new-message',
  CONVERSATION_SEEN: 'chat:conversation-seen',
} as const
