import redis from '../../config/redis.config.js'
import {
  OrderStatus,
  PaymentMethod,
  PaymentResultType,
  PaymentStatus,
  UserRole,
} from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import {
  ORDER_STATUS_TRANSITIONS,
  ORDER_DEFAULT_PAGE,
  ORDER_DEFAULT_PAGE_SIZE,
  ORDER_MAX_PAGE_SIZE,
} from './order.constants.js'
import { MockProductService } from './mockProduct.service.js'
import type { PlaceOrderInput, GuestOrderInput } from './order.validation.js'
import { PaymentService } from '../payment/payment.service.js'
import { PaymentProviderAvailabilityService } from '../payment/providers/payment-provider-availability.service.js'
import { ProductService } from '../product/product.service.js'
import {
  getPaymentResultTokenContext,
  issuePaymentResultToken,
} from '../payment/payment.helper.js'
import httpStatus from 'http-status'
import { ApplyCouponInput } from './order.validation.js'
import crypto from 'crypto'

const generateOrderId = (): string => {
  const date = new Date()
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `ORD-${yearMonth}-${randomStr}`
}
const acquireLock = async (key: string, ttl: number = 10) => {
  const result = await redis.set(`checkout_lock:${key}`, 'processing', 'EX', ttl, 'NX')
  if (!result) {
    throw new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      'Please wait, your previous order is processing.'
    )
  }
}

const getVendorDeliveryCharge = async (vendorId: string) => {
  const cacheKey = `delivery_charge:${vendorId}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      address: true,
      deliveryCharge: true,
    },
  })

  if (vendor) {
    await redis.set(cacheKey, JSON.stringify(vendor), 'EX', 86400)
  }
  return vendor
}
// TODO: Replace with real CommissionService.triggerCommission(orderId)
// const triggerCommission = async (orderId: string): Promise<void> => {
//
// }

type OrderResultType = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'PENDING'

// Reusable product select shapes for Prisma queries
const productSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
} as const

const productSelectWithVendor = {
  ...productSelect,
  vendorId: true,
} as const

// Reusable courier select shape for Prisma queries
const courierSelect = {
  select: {
    id: true,
    provider: true,
    consignmentId: true,
    trackingCode: true,
    status: true,
    invoice: true,
    createdAt: true,
    updatedAt: true,
  },
  orderBy: {
    createdAt: 'desc' as const,
  },
} as const


// Validate each item: check if the product exists, has enough stock, and passes the MockProductService limit
const validateAndGetProducts = async (
  items: { productId: string; quantity: number }[]
): Promise<
  {
    product: {
      id: string
      name: string
      price: number
      stock: number
      vendorId: string
    }
    quantity: number
  }[]
> => {
  if (items.length === 0) throw new AppError(httpStatus.BAD_REQUEST, 'Order must contain at least one item')

  return Promise.all(
    items.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          vendorId: true,
        },
      })

      if (!product) throw new AppError(404, `Product "${item.productId}" not found`)

      if (product.stock < item.quantity) {
        throw new AppError(
          400,
          `"${product.name}" has only ${product.stock} in stock. You requested ${item.quantity}`
        )
      }

      const mockStock = await MockProductService.getStock(item.productId)
      if (item.quantity > mockStock) {
        throw new AppError(400, `"${product.name}" quantity limit exceeded`)
      }

      return { product, quantity: item.quantity }
    })
  )
}

// Create order, order items, and decrement stock — all in one atomic transaction
const createOrderInTransaction = async (
  orderData: {
    guestCustomerId: string
    addressId: string
    totalPrice: number
    deliveryCharge: number
    originalAmount?: number
    discountAmount?: number
    affiliateEarning?: number
    vendorEarning?: number
    vendorCouponId?: string | null
  },
  productDetails: { product: { id: string; price: number }; quantity: number }[]
) => {
  return prisma.$transaction(async (tx) => {
    // Create the main order record with delivery charge
    const generatedId = generateOrderId()
    const newOrder = await tx.order.create({
      data: { 
        orderId: generatedId,
        ...orderData 
      },
    })

    // Create all related order items
    await tx.orderItem.createMany({
      data: productDetails.map(({ product, quantity }) => ({
        orderId: newOrder.id,
        productId: product.id,
        quantity,
        price: product.price,
      })),
    })

    return newOrder
  })
}

// Shared core logic for both placeOrder and placeGuestOrder
// Step 1: Validate products and calculate total price
// Step 2: Look up District and Division by name
// Step 3: Create Address for this order
// Step 4: Create a new standalone GuestCustomer (no User record needed)
// Step 5: Create order in transaction
const processOrder = async (
  customerInfo: {
    name: string
    email: string
    phone: string
    area: string
    districtName: string
    divisionName: string
  },
  items: { productId: string; quantity: number }[],
  paymentMethod: 'COD' | 'SSLCOMMERZ' | 'EPS',
  couponCode?: string
) => {
  // Point 13: Duplicate Order Prevention
  await acquireLock(customerInfo.email || customerInfo.phone)

  // Step 1: Validate products
  const productDetails = await validateAndGetProducts(items)

  if (!productDetails.length) {
    throw new AppError(400, 'No valid products found')
  }

  // Calculate items price accurately
  const itemsPrice = productDetails.reduce(
    (sum, { product, quantity }) => Math.round((sum + product.price * quantity) * 100) / 100,
    0
  )

  // Step 2: Look up district and division by name
  const district = await prisma.district.findUnique({
    where: { name: customerInfo.districtName },
  })
  if (!district) {
    throw new AppError(
      400,
      `District "${customerInfo.districtName}" not found in our delivery zones.`
    )
  }

  const division = await prisma.division.findUnique({
    where: { name: customerInfo.divisionName },
  })
  if (!division) {
    throw new AppError(
      400,
      `Division "${customerInfo.divisionName}" not found in our delivery zones.`
    )
  }

  // Look up vendor's district using the first product's vendorId
  const firstProduct = productDetails[0]
  if (!firstProduct) {
    throw new AppError(400, 'No products found')
  }
  const vendorId = firstProduct.product.vendorId

  // Point 12: Delivery Charge Caching
  const vendor = await getVendorDeliveryCharge(vendorId)

  if (!vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  await PaymentProviderAvailabilityService.assertCustomerPaymentMethodAvailable(
    vendorId,
    paymentMethod,
    vendor.pageConfig
  )

  const isSameDistrict = vendor.address?.districtId === district.id
  const insideCharge = vendor.deliveryCharge?.insideCharge ?? 60
  const outsideCharge = vendor.deliveryCharge?.outsideCharge ?? 120
  const deliveryCharge = isSameDistrict ? insideCharge : outsideCharge

  const totalPrice = Math.round((itemsPrice + deliveryCharge) * 100) / 100

  // Step 3: Create Address for this order
  const newAddress = await prisma.address.create({
    data: {
      area: customerInfo.area,
      district: { connect: { id: district.id } },
      division: { connect: { id: division.id } },
    },
  })

  // Step 4: Create a standalone GuestCustomer — no User record, no role
  const guestCustomer = await prisma.guestCustomer.create({
    data: {
      name: customerInfo.name,
      email: customerInfo.email,
      phone: customerInfo.phone,
      address: { connect: { id: newAddress.id } },
    },
    select: { id: true },
  })

  // Calculate coupon discount if provided
  let orderAmounts = {
    totalPrice,
    originalAmount: itemsPrice,
    discountAmount: 0,
    affiliateEarning: 0,
    vendorEarning: itemsPrice,
    vendorCouponId: null as string | null,
  }

  if (couponCode) {
    const couponResult = await applyCoupon({ code: couponCode, items })
    orderAmounts = {
      totalPrice: Math.round((couponResult.finalAmountPaidByCustomer + deliveryCharge) * 100) / 100,
      originalAmount: couponResult.originalAmount,
      discountAmount: couponResult.discountAmount,
      affiliateEarning: couponResult.affiliateEarning,
      vendorEarning: couponResult.vendorEarning,
      vendorCouponId: couponResult.couponId,
    }
  }

  // Step 5: Create the order within a transaction
  const order = await createOrderInTransaction(
    {
      guestCustomerId: guestCustomer.id,
      addressId: newAddress.id,
      deliveryCharge,
      ...orderAmounts,
    },
    productDetails
  )

  let resultToken: string | null = null
  let gatewayPageURL: string | null = null

  if (paymentMethod === 'SSLCOMMERZ' || paymentMethod === 'EPS') {
    const onlinePaymentResult = await PaymentService.initiatePayment(order.id, paymentMethod)
    gatewayPageURL = onlinePaymentResult.gatewayPageURL
  } else if (paymentMethod === 'COD') {
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          transactionId: `COD-${Date.now()}`,
          amount: orderAmounts.totalPrice,
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
        },
      select: {
        transactionId: true,
      },
    })

    resultToken = await issuePaymentResultToken(PaymentResultType.ORDER, payment.transactionId)
  }

  return {
    order,
    guestCustomerId: guestCustomer.id,
    gatewayPageURL,
    resultToken,
  }
}

// ─────────────────────────────────────────────
// APPLY COUPON
// ─────────────────────────────────────────────
const applyCoupon = async (payload: ApplyCouponInput) => {
  const { code, items } = payload

  // Validate products to get the original total price
  const productDetails = await validateAndGetProducts(items)
  if (!productDetails.length) throw new AppError(400, 'No valid products found')

  const firstProduct = productDetails[0]!
  const vendorId = firstProduct.product.vendorId

  // Ensure all products belong to the same vendor
  const allSameVendor = productDetails.every(p => p.product.vendorId === vendorId)
  if (!allSameVendor) throw new AppError(400, 'All items must belong to the same vendor')

  const originalAmount = productDetails.reduce(
    (sum, { product, quantity }) => Math.round((sum + product.price * quantity) * 100) / 100,
    0
  )

  const coupon = await prisma.vendorCoupon.findFirst({
    where: { code, vendorId, isActive: true },
    include: { applicableTemplates: true }
  })

  if (!coupon) throw new AppError(404, 'Invalid or expired coupon')

  if (coupon.expiresAt < new Date()) throw new AppError(400, 'Coupon has expired')
  if (coupon.startsAt > new Date()) throw new AppError(400, 'Coupon is not active yet')
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new AppError(400, 'Coupon usage limit reached')
  if (coupon.minimumAmount && originalAmount < coupon.minimumAmount) throw new AppError(400, `Minimum order amount of ${coupon.minimumAmount} required`)

  let discountAmount = 0
  if (coupon.discountType === 'PERCENTAGE') {
    discountAmount = (originalAmount * coupon.discountValue) / 100
    if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
      discountAmount = coupon.maxDiscountAmount
    }
  } else {
    discountAmount = coupon.discountValue
  }

  // Ensure discount doesn't exceed original amount
  discountAmount = Math.min(discountAmount, originalAmount)
  const finalAmountPaidByCustomer = originalAmount - discountAmount

  let affiliateEarning = 0
  if (coupon.affiliateId) {
    if (coupon.affiliateCommissionType === 'PERCENTAGE') {
      affiliateEarning = (finalAmountPaidByCustomer * coupon.affiliateCommissionValue) / 100
    } else {
      affiliateEarning = coupon.affiliateCommissionValue
    }
  }

  const vendorEarning = finalAmountPaidByCustomer - affiliateEarning

  return {
    originalAmount,
    discountAmount,
    finalAmountPaidByCustomer,
    affiliateEarning,
    vendorEarning,
    couponId: coupon.id,
    affiliateId: coupon.affiliateId
  }
}

// Place a regular order — userId is currently optional, not strictly used for the guest-based flow
const placeOrder = async (_userId: string | null, payload: PlaceOrderInput) => {
  const { order, gatewayPageURL, resultToken } = await processOrder(
    payload.customerInfo,
    payload.items,
    payload.paymentMethod,
    payload.couponCode
  )

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      id: true,
      orderId: true,
      totalPrice: true,
      deliveryCharge: true,
      guestCustomer: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
      payment: {
        select: {
          paymentMethod: true,
          paymentStatus: true,
          transactionId: true,
        },
      },
      items: {
        select: {
          quantity: true,
          price: true,
          product: { select: productSelect },
        },
      },
      courierOrders: courierSelect,
    },
  })

  return {
    ...fullOrder,
    gatewayPageURL,
    resultToken,
  }
}

// Place a guest order — returns guestCustomerId so the guest can track their order later
const placeGuestOrder = async (payload: GuestOrderInput) => {
  const { order, guestCustomerId, gatewayPageURL, resultToken } = await processOrder(
    payload.customerInfo,
    payload.items,
    payload.paymentMethod,
    payload.couponCode
  )

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      id: true,
      orderId: true,
      status: true,
      totalPrice: true,
      deliveryCharge: true,

      address: {
        select: {
          area: true,
          district: { select: { name: true } },
          division: { select: { name: true } },
        },
      },
      payment: {
        select: {
          paymentMethod: true,
          paymentStatus: true,
          transactionId: true,
        },
      },
      createdAt: true,
      items: {
        select: {
          quantity: true,
          price: true,
          product: { select: productSelect },
        },
      },
      courierOrders: courierSelect,
    },
  })

  return {
    ...fullOrder,
    guestCustomerId,
    gatewayPageURL,
    resultToken,
  }
}

// Track order by guestCustomerId — requires no login
const trackGuestOrder = async (guestCustomerId: string) => {
  const order = await prisma.order.findFirst({
    where: { guestCustomerId },
    select: {
      id: true,
      orderId: true,
      status: true,
      createdAt: true,
      totalPrice: true,
      courierOrders: courierSelect,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!order) throw new AppError(404, 'No order found for this tracking ID')

  return order
}

const getOrderResult = async (resultToken: string) => {
  const paymentResultTokenContext = await getPaymentResultTokenContext(resultToken)

  if (paymentResultTokenContext.transactionType !== PaymentResultType.ORDER) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid order result token')
  }

  const order = await prisma.order.findFirst({
    where: {
      payment: {
        some: {
          transactionId: paymentResultTokenContext.transactionId,
        },
      },
    },
    select: {
      id: true,
      orderId: true,
      status: true,
      totalPrice: true,
      deliveryCharge: true,
      createdAt: true,

      guestCustomer: {
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },

      address: {
        select: {
          area: true,
          district: {
            select: {
              name: true,
            },
          },
          division: {
            select: {
              name: true,
            },
          },
        },
      },

      items: {
        select: {
          quantity: true,
          price: true,
          product: {
            select: {
              name: true,
              images: true,
            },
          },
        },
      },

      payment: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
        select: {
          paymentMethod: true,
          paymentStatus: true,
        },
      },
      courierOrders: courierSelect,
    },
  })

  if (!order) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid order result token')
  }

  const latestPayment = order.payment[0] ?? null

  let resultType: OrderResultType = 'PENDING'

  if (latestPayment?.paymentMethod === PaymentMethod.COD) {
    resultType = 'SUCCESS'
  } else if (latestPayment?.paymentStatus === PaymentStatus.PAID) {
    resultType = 'SUCCESS'
  } else if (latestPayment?.paymentStatus === PaymentStatus.FAILED) {
    resultType = 'FAILED'
  } else if (latestPayment?.paymentStatus === PaymentStatus.CANCELLED) {
    resultType = 'CANCELLED'
  }

  return {
    resultType,
    order: {
      id: order.id,
      orderId: order.orderId,
      totalPrice: order.totalPrice,
      deliveryCharge: order.deliveryCharge,
      createdAt: order.createdAt,
      guestCustomer: order.guestCustomer,
      address: order.address,
      items: order.items,
      courierOrders: order.courierOrders,
      paymentMethod: latestPayment?.paymentMethod ?? null,
      paymentStatus: latestPayment?.paymentStatus ?? null,
    },
  }
}

// Get all orders — filtered based on the requester's role
// ADMIN  → View all orders
// VENDOR → View only orders containing their specific products
const getAllOrders = async (
  userId: string,
  role: string,
  page = ORDER_DEFAULT_PAGE,
  limit = ORDER_DEFAULT_PAGE_SIZE
) => {
  const safePage = Math.max(1, page)
  const safeLimit = Math.min(Math.max(1, limit), ORDER_MAX_PAGE_SIZE)
  const skip = (safePage - 1) * safeLimit

  const itemSelect = {
    select: {
      quantity: true,
      price: true,
      product: { select: productSelectWithVendor },
    },
  }

  const baseSelect = {
    id: true,
    orderId: true,
    status: true,
    totalPrice: true,
    deliveryCharge: true,
    guestCustomer: {
      select: {
        name: true,
        email: true,
        phone: true,
      },
    },
    address: {
      select: {
        area: true,
        district: { select: { name: true } },
        division: { select: { name: true } },
      },
    },
    payment: {
      select: {
        paymentMethod: true,
        paymentStatus: true,
        transactionId: true,
      },
    },
    createdAt: true,
    items: itemSelect,
    courierOrders: courierSelect,
  }

  // Handle ADMIN retrieval logic
  if (role === UserRole.ADMIN) {
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        skip,
        take: safeLimit,
        select: baseSelect,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count(),
    ])
    return buildPaginatedResponse(data, total, safePage, safeLimit)
  }

  // Handle VENDOR retrieval logic
  // product.vendorId → Vendor.id (NOT User.id), so we must resolve it first
  if (role === UserRole.VENDOR) {
    const vendorRecord = await prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!vendorRecord) throw new AppError(404, 'Vendor profile not found.')

    const vendorId = vendorRecord.id
    const where = { items: { some: { product: { vendorId } } } }

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: safeLimit,
        select: {
          ...baseSelect,
          // Only show this vendor's product items — hide other vendors' items
          items: {
            where: { product: { vendorId } },
            ...itemSelect,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ])
    return buildPaginatedResponse(data, total, safePage, safeLimit)
  }

  throw new AppError(403, 'Access denied. Only ADMIN and VENDOR can access this endpoint.')
}

// Retrieve orders by the logged-in user's email — looks up GuestCustomer records matching that email
const getMyOrders = async (
  userEmail: string,
  page = ORDER_DEFAULT_PAGE,
  limit = ORDER_DEFAULT_PAGE_SIZE
) => {
  const safePage = Math.max(1, page)
  const safeLimit = Math.min(Math.max(1, limit), ORDER_MAX_PAGE_SIZE)
  const skip = (safePage - 1) * safeLimit

  // Guest orders are matched by guestCustomer email
  const where = { guestCustomer: { email: userEmail } }

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: safeLimit,
      select: {
        id: true,
        orderId: true,
        status: true,
        totalPrice: true,
        deliveryCharge: true,

        address: {
          select: {
            area: true,
            district: { select: { name: true } },
            division: { select: { name: true } },
          },
        },
        payment: {
          select: {
            paymentMethod: true,
            paymentStatus: true,
            transactionId: true,
          },
        },
        createdAt: true,
        items: {
          select: {
            quantity: true,
            price: true,
            product: { select: productSelect },
          },
        },
        courierOrders: courierSelect,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where }),
  ])

  return buildPaginatedResponse(data, total, safePage, safeLimit)
}

// Get a single order's details — applies ownership and role constraints
const getSingleOrder = async (orderId: string, requesterId: string, role: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderId: true,
      status: true,
      totalPrice: true,
      deliveryCharge: true,
      guestCustomerId: true,

      address: {
        select: {
          area: true,
          district: { select: { name: true } },
          division: { select: { name: true } },
        },
      },
      payment: {
        select: {
          paymentMethod: true,
          paymentStatus: true,
          transactionId: true,
        },
      },
      createdAt: true,
      items: {
        select: {
          quantity: true,
          price: true,
          product: { select: productSelectWithVendor },
        },
      },
      courierOrders: courierSelect,
    },
  })

  if (!order) throw new AppError(404, 'Order not found')
  if (role === UserRole.ADMIN) return order

  // Ensure VENDOR can only view an order if it contains their products
  // product.vendorId → Vendor.id (NOT User.id), must resolve first
  if (role === UserRole.VENDOR) {
    const vendorRecord = await prisma.vendor.findUnique({
      where: { userId: requesterId },
      select: { id: true },
    })
    if (!vendorRecord) throw new AppError(404, 'Vendor profile not found.')

    const hasProduct = order.items.some((item) => item.product.vendorId === vendorRecord.id)
    if (!hasProduct) throw new AppError(403, 'You can only view orders containing your products.')

    // Return only this vendor's items, hide other vendors' items
    return {
      ...order,
      items: order.items.filter((item) => item.product.vendorId === vendorRecord.id),
    }
  }

  // For other authenticated users: access denied — guests use the track API with guestCustomerId
  throw new AppError(403, 'Access denied. Use the guest tracking endpoint to view your order.')
}

// Update the status of an existing order — restricted to ADMIN and VENDOR roles
// Enforces strict status transition rules defined in constants
const updateOrderStatus = async (
  orderId: string,
  newStatus: OrderStatus,
  requesterId: string,
  requesterRole: string
) => {
  // Only ADMIN and VENDOR can update order status
  if (requesterRole !== 'ADMIN' && requesterRole !== 'VENDOR') {
    throw new AppError(403, 'Only ADMIN and VENDOR are permitted to update order statuses.')
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new AppError(404, 'Order not found')

  if (requesterRole === 'VENDOR') {
    const vendorRecord = await prisma.vendor.findUnique({
      where: { userId: requesterId },
      select: { id: true },
    })
    if (!vendorRecord) throw new AppError(404, 'Vendor profile not found.')

    const vendorId = vendorRecord.id

    const vendorOrder = await prisma.order.findFirst({
      where: { id: orderId, items: { some: { product: { vendorId } } } },
    })
    if (!vendorOrder) throw new AppError(403, 'This order does not contain your products.')
  }

  const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] ?? []

  if (!allowedNext.includes(newStatus)) {
    const err = new AppError(
      400,
      `Cannot change status from "${order.status}" to "${newStatus}"`
    ) as AppError & {
      currentStatus: OrderStatus
      attemptedStatus: OrderStatus
      allowedTransitions: OrderStatus[]
    }
    err.currentStatus = order.status
    err.attemptedStatus = newStatus
    err.allowedTransitions = allowedNext
    throw err
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus },
  })

  // Reduce stock when status becomes CONFIRMED
  if (newStatus === OrderStatus.CONFIRMED && order.status !== OrderStatus.CONFIRMED) {
    await ProductService.reduceStockAfterCompletedOrder(orderId)
  }

  // Restock when order is cancelled/returned/refunded/failed
  // Only restock if it was previously in a state where stock was deducted (i.e. not PENDING, and not already restocked/failed)
  const restockStatuses: OrderStatus[] = [
    OrderStatus.CANCELLED,
    OrderStatus.RETURNED,
    OrderStatus.REFUNDED,
    OrderStatus.FAILED,
  ]
  if (
    restockStatuses.includes(newStatus) &&
    !restockStatuses.includes(order.status) &&
    order.status !== OrderStatus.PENDING
  ) {
    await ProductService.restockAfterCancelledOrder(orderId)
  }

  // Trigger commission logic when order transitions to COMPLETED (final state)
  // if (newStatus === OrderStatus.COMPLETED) await triggerCommission(orderId)

  return updated
}

// Utility function to build a consistent paginated response shape for all listing endpoints
const buildPaginatedResponse = <T>(data: T[], total: number, page: number, limit: number) => ({
  data,
  meta: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  },
})

// Export the constructed OrderService object for external use
export const OrderService = {
  placeOrder,
  placeGuestOrder,
  trackGuestOrder,
  applyCoupon,
  getAllOrders,
  getMyOrders,
  getSingleOrder,
  updateOrderStatus,
  getOrderResult,
  // cancelOrder,
}
