import { UserRole } from '@prisma/client'
import httpStatus from 'http-status'

import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { SendMessagePayload } from './chat.validation.js'

const sendMessage = async (userId: string, userRole: UserRole, payload: SendMessagePayload) => {
  let vendorId: string

  // The vendor will send a message in their own conversation
  if (userRole === UserRole.VENDOR) {
    const vendor = await prisma.vendor.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    })

    if (!vendor) {
      throw new AppError(httpStatus.NOT_FOUND, 'Vendor profile not found')
    }

    vendorId = vendor.id
  }

  // The admin can send a message to any vendor
  else if (userRole === UserRole.ADMIN) {
    if (!payload.vendorId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Vendor ID is required')
    }

    const vendor = await prisma.vendor.findUnique({
      where: {
        id: payload.vendorId,
      },
      select: {
        id: true,
      },
    })

    if (!vendor) {
      throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
    }

    vendorId = vendor.id
  }

  // No other role can use the chat
  else {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not allowed to send messages')
  }

  const result = await prisma.$transaction(async (tx) => {
    // If an existing conversation exists, it will use that;
    // otherwise, it will create a new conversation.
    const conversation = await tx.chatConversation.upsert({
      where: {
        vendorId,
      },
      update: {},
      create: {
        vendorId,
      },
      select: {
        id: true,
        vendorId: true,
      },
    })

    const message = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: payload.content,
      },
      select: {
        id: true,
        conversationId: true,
        content: true,
        isSeen: true,
        seenAt: true,
        createdAt: true,

        sender: {
          select: {
            id: true,
            name: true,
            role: true,
            avatar: true,

            admin: {
              select: {
                avatar: true,
              },
            },

            vendor: {
              select: {
                avatar: true,
                shopName: true,
              },
            },
          },
        },
      },
    })

    await tx.chatConversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        lastMessageAt: message.createdAt,
      },
      select: {
        id: true,
      },
    })

    return {
      ...message,
      vendorId: conversation.vendorId,
    }
  })

  return result
}

const getAdminConversationList = async () => {
  const conversations = await prisma.chatConversation.findMany({
    orderBy: {
      lastMessageAt: 'desc',
    },
    select: {
      id: true,
      vendorId: true,
      lastMessageAt: true,
      createdAt: true,

      vendor: {
        select: {
          id: true,
          shopName: true,
          avatar: true,

          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },

      messages: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
        select: {
          id: true,
          content: true,
          isSeen: true,
          createdAt: true,

          sender: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      },

      _count: {
        select: {
          messages: {
            where: {
              isSeen: false,
              sender: {
                role: UserRole.VENDOR,
              },
            },
          },
        },
      },
    },
  })

  return conversations.map((conversation) => ({
    id: conversation.id,
    vendorId: conversation.vendorId,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    vendor: conversation.vendor,
    lastMessage: conversation.messages[0] ?? null,
    unreadCount: conversation._count.messages,
  }))
}

const getVendorConversation = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor profile not found')
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: {
      vendorId: vendor.id,
    },
    select: {
      id: true,
      vendorId: true,
      lastMessageAt: true,
      createdAt: true,

      messages: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
        select: {
          id: true,
          content: true,
          isSeen: true,
          createdAt: true,

          sender: {
            select: {
              id: true,
              role: true,
            },
          },
        },
      },

      _count: {
        select: {
          messages: {
            where: {
              isSeen: false,
              sender: {
                role: UserRole.ADMIN,
              },
            },
          },
        },
      },
    },
  })

  if (!conversation) {
    return null
  }

  return {
    id: conversation.id,
    vendorId: conversation.vendorId,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    lastMessage: conversation.messages[0] ?? null,
    unreadCount: conversation._count.messages,
  }
}

const getConversationMessages = async (
  userId: string,
  userRole: UserRole,
  conversationId: string
) => {
  const conversation = await prisma.chatConversation.findUnique({
    where: {
      id: conversationId,
    },
    select: {
      id: true,
      vendorId: true,

      vendor: {
        select: {
          userId: true,
        },
      },
    },
  })

  if (!conversation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
  }

  if (userRole === UserRole.VENDOR && conversation.vendor.userId !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You do not have permission to access this conversation'
    )
  }

  if (userRole !== UserRole.ADMIN && userRole !== UserRole.VENDOR) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not allowed to access conversations')
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      conversationId: true,
      content: true,
      isSeen: true,
      seenAt: true,
      createdAt: true,

      sender: {
        select: {
          id: true,
          name: true,
          role: true,
          avatar: true,

          admin: {
            select: {
              avatar: true,
            },
          },

          vendor: {
            select: {
              avatar: true,
              shopName: true,
            },
          },
        },
      },
    },
  })

  return messages
}

const markConversationAsSeen = async (
  userId: string,
  userRole: UserRole,
  conversationId: string
) => {
  const conversation = await prisma.chatConversation.findUnique({
    where: {
      id: conversationId,
    },
    select: {
      id: true,
      vendorId: true,

      vendor: {
        select: {
          userId: true,
        },
      },
    },
  })

  if (!conversation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
  }

  // The vendor can only see their own conversations
  if (userRole === UserRole.VENDOR && conversation.vendor.userId !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You do not have permission to access this conversation'
    )
  }

  if (userRole !== UserRole.ADMIN && userRole !== UserRole.VENDOR) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not allowed to access conversations')
  }

  const senderRoleToMarkAsSeen = userRole === UserRole.ADMIN ? UserRole.VENDOR : UserRole.ADMIN

  const seenAt = new Date()

  const result = await prisma.chatMessage.updateMany({
    where: {
      conversationId,
      isSeen: false,

      sender: {
        role: senderRoleToMarkAsSeen,
      },
    },
    data: {
      isSeen: true,
      seenAt,
    },
  })

  return {
    conversationId,
    vendorId: conversation.vendorId,
    updatedCount: result.count,
    seenAt,
    seenByRole: userRole,
    seenMessageSenderRole: senderRoleToMarkAsSeen,
  }
}

export const ChatService = {
  sendMessage,
  getAdminConversationList,
  getVendorConversation,
  getConversationMessages,
  markConversationAsSeen,
}
