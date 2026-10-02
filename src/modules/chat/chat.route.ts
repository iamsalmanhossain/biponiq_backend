import { Router } from 'express'

import { ChatController } from './chat.controller.js'
import { authorizeRole } from '../../middleware/rbac.middleware.js'
import { UserRole } from '@prisma/client'
import { authenticate } from '../../middleware/authinticate.js'
import { sendMessageSchema } from './chat.validation.js'
import { validateSchema } from '../../middleware/validateRequest.js'

const router: Router = Router()

router.use(authenticate)

router.post(
  '/messages',
  authorizeRole(UserRole.ADMIN, UserRole.VENDOR),
  validateSchema(sendMessageSchema),
  ChatController.sendMessage
)

router.get(
  '/admin/conversations',
  authorizeRole(UserRole.ADMIN),
  ChatController.getAdminConversationList
)

router.get(
  '/vendor/conversation',
  authorizeRole(UserRole.VENDOR),
  ChatController.getVendorConversation
)

router.get(
  '/conversations/:conversationId/messages',
  authorizeRole(UserRole.ADMIN, UserRole.VENDOR),
  ChatController.getConversationMessages
)

router.patch(
  '/conversations/:conversationId/seen',
  authorizeRole(UserRole.ADMIN, UserRole.VENDOR),
  ChatController.markConversationAsSeen
)

export const ChatRoutes = router
