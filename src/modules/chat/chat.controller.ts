import { type Request, type Response } from 'express'
import { UserRole } from '@prisma/client'
import httpStatus from 'http-status'

import catchAsync from '../../shared/utils/catchAsync.js'
import AppError from '../../shared/errors/AppError.js'
import { ChatService } from './chat.service.js'
import { ApiResponse } from '../../shared/utils/ApiResponse.js'
import { emitConversationSeen, emitNewChatMessage } from '../../socket/chatSocketEmitter.js'

const sendMessage = catchAsync(async (req: Request, res: Response) => {
  const user = req.user

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized user')
  }

  const result = await ChatService.sendMessage(user.id, user.role as UserRole, req.body)

  emitNewChatMessage(result)

  ApiResponse.success(res, result, 'Message sent successfully', httpStatus.CREATED)
})

const getAdminConversationList = catchAsync(async (_req: Request, res: Response) => {
  const result = await ChatService.getAdminConversationList()

  ApiResponse.success(res, result, 'Conversation list retrieved successfully', httpStatus.OK)
})

const getVendorConversation = catchAsync(async (req: Request, res: Response) => {
  const user = req.user

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized user')
  }

  const result = await ChatService.getVendorConversation(user.id)

  ApiResponse.success(res, result, 'Vendor conversation retrieved successfully', httpStatus.OK)
})

const getConversationMessages = catchAsync(async (req: Request, res: Response) => {
  const user = req.user
  const { conversationId } = req.params

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized user')
  }

  const result = await ChatService.getConversationMessages(
    user.id,
    user.role as UserRole,
    conversationId as string
  )

  ApiResponse.success(res, result, 'Conversation messages retrieved successfully', httpStatus.OK)
})

const markConversationAsSeen = catchAsync(async (req: Request, res: Response) => {
  const user = req.user
  const { conversationId } = req.params

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized user')
  }

  const result = await ChatService.markConversationAsSeen(
    user.id,
    user.role as UserRole,
    conversationId as string
  )

  emitConversationSeen(result)

  ApiResponse.success(res, result, 'Conversation marked as seen successfully', httpStatus.OK)
})

export const ChatController = {
  sendMessage,
  getAdminConversationList,
  getVendorConversation,
  getConversationMessages,
  markConversationAsSeen,
}
