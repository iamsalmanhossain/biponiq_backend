import express, { Router } from 'express'

import { CommissionRoutes } from '../modules/commission/commission.route.js'
import { CodRoutes } from '../modules/cod/cod.route.js'
import { VendorRoutes } from '../modules/vendor/vendor.route.js'
import { ProductRoutes } from '../modules/product/product.route.js'
import { OrderRoutes } from '../modules/order/order.route.js'
import { AdminRoutes } from '../modules/admin/admin.route.js'
import { PaymentRoutes } from '../modules/payment/payment.route.js'
import { UploadRoutes } from '../modules/upload/upload.route.js'
import { DashboardRoutes } from '../modules/dashboard/dashboard.routes.js'
import { LocationRoutes } from '../modules/location/location.route.js'
import { CashoutRoutes } from '../modules/cashout/cashout.route.js'
import { AuthRoutes } from '../modules/auth/auth.route.js'
import { AffiliateAuthRoutes } from '../modules/affiliateAuth/affiliateAuth.route.js'
import { SubscriptionRoutes } from '../modules/subscription/subscription.route.js'
import { VisitorTrackingRoutes } from '../modules/visitorTracking/visitorTracking.route.js'
import { PixelEventRoutes } from '../modules/pixelEvent/pixelEvent.route.js'
import { TiktokPixelRoutes } from '../modules/tiktokPixel/tiktokPixel.route.js'
import { TemplateRoutes } from '../modules/template/template.route.js'
import { PlatformSettingRoutes } from '../modules/platformSetting/platformSetting.route.js'
import { CouponRoutes } from '../modules/coupon/coupon.route.js'
import { ChatRoutes } from '../modules/chat/chat.route.js'
import { BackupRoutes } from '../modules/backup/backup.routes.js'
import { DomainRoutes } from '../modules/domain/domain.route.js'
import { DeveloperRoutes } from '../modules/developer/developer.route.js'
import { CourierRoutes } from '../modules/courier/courier.route.js'
import { AichatbootRoute } from '../modules/aiChatBot/aiChatBot.route.js'
import { DocumentationRoutes } from '../modules/documentation/documentation.route.js'
import { VisitorLimitTopupRoutes } from '../modules/visitorLimitTopup/visitorLimitTopup.route.js'

const router: Router = express.Router()

const moduleRoutes = [
  {
    path: '/courier',
    route: CourierRoutes,
  },
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/auth/affiliate',
    route: AffiliateAuthRoutes,
  },
  {
    path: '/vendor',
    route: VendorRoutes,
  },
  {
    path: '/products',
    route: ProductRoutes,
  },
  {
    path: '/orders',
    route: OrderRoutes,
  },

  {
    path: '/cod',
    route: CodRoutes,
  },

  {
    path: '/commission',
    route: CommissionRoutes,
  },

  {
    path: '/admin',
    route: AdminRoutes,
  },
  {
    path: '/payment',
    route: PaymentRoutes,
  },
  {
    path: '/uploads',
    route: UploadRoutes,
  },
  {
    path: '/dashboards',
    route: DashboardRoutes,
  },
  {
    path: '/location',
    route: LocationRoutes,
  },
  {
    path: '/cashout',
    route: CashoutRoutes,
  },
  {
    path: '/subscriptions',
    route: SubscriptionRoutes,
  },
  {
    path: '/visitorTracking',
    route: VisitorTrackingRoutes,
  },
  {
    path: '/pixel-events',
    route: PixelEventRoutes,
  },
  {
    path: '/tiktok-pixel',
    route: TiktokPixelRoutes,
  },
  {
    path: '/templates',
    route: TemplateRoutes,
  },
  {
    path: '/platform-settings',
    route: PlatformSettingRoutes,
  },
  {
    path: '/coupons',
    route: CouponRoutes,
  },
  {
    path: '/chat',
    route: ChatRoutes,
  },
  {
    path: '/backup',
    route: BackupRoutes,
  },
  {
    path: '/domains',
    route: DomainRoutes,
  },
  {
    path: '/ai-chatbot',
    route: AichatbootRoute
  },
  {
    path: '/documentations',
    route: DocumentationRoutes,
  },
  {
    path: '/',
    route: DeveloperRoutes,
  },
  {
    path: '/visitor-limit-topup',
    route: VisitorLimitTopupRoutes,
  },
  {
    path: '/documentations',
    route: DocumentationRoutes,
  }
]

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route)
})

export default router
