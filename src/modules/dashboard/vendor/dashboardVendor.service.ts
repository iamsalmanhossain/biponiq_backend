import { OrderStatus, PaymentMethod, Prisma, ProductStatus } from '@prisma/client'
import { prisma } from '../../../lib/prisma.js'
import { checkExistingAccount } from '../../../shared/utils/checkExistingAccount.js'
import { upsertVendorDeliveryCharge } from '../../vendor/deliveryCharge.service.js'
const vendorDashboardStats = async (
  userId: string,
  sort: string,
  productStatus?: ProductStatus
) => {
  const { id: vendorId } = await checkExistingAccount('vendor', userId) // Check if vendor account exists, get vendorId

  const [
    totalProducts,
    productByStatus,
    productsList,
    totalOrders,
    ordersByStatus,
    totalDeliveredOrders,
    pendingEarnings,
    pendingCodOrders,
  ] = await Promise.all([
    // 1. All vendor's Products count
    prisma.product.count({
      where: { vendorId },
    }),

    //vendor products grouped by status
    await prisma.product.groupBy({
      by: ['status'],
      where: {
        vendorId,
      },
      _count: { id: true },
    }),

    // Product list
    prisma.product.findMany({
      where: { vendorId, status: productStatus ? productStatus : {} },
      orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        status: true,
      },
    }),

    // 2. Total vendor Orders
    prisma.order.count({
      where: {
        items: {
          some: { product: { vendorId } },
        },
      },
    }),

    // 3. Orders by status and count them
    prisma.order.groupBy({
      by: ['status'],
      where: {
        items: {
          some: { product: { vendorId } },
        },
      },
      _count: { id: true },
    }),

    // 4. All delivered or completed orders
    prisma.orderItem.findMany({
      where: {
        product: { vendorId },
        order: {
          status: {
            in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
          },
        },
      },
      select: {
        price: true,
        quantity: true,
      },
    }),

    // 5. Pending Earnings — orders not yet DELIVERED
    prisma.orderItem.findMany({
      where: {
        product: { vendorId },
        order: {
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.CONFIRMED,
              OrderStatus.PROCESSING,
              OrderStatus.SHIPPED,
            ],
          },
        },
      },
      select: {
        price: true,
        quantity: true,
      },
    }),

    // 6. COD orders pending delivery action
    prisma.order.count({
      where: {
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.CONFIRMED,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
          ],
        },
        payment: { some: { paymentMethod: PaymentMethod.COD } },
        items: {
          some: { product: { vendorId } },
        },
      },
    }),
  ])

  // Clean Status and count {"ACTIVE": 10, "INACTIVE": 5}
  const productStatusBreakdown: Record<string, number> = {}
  for (const product of productByStatus) {
    productStatusBreakdown[product.status] = product._count.id
  }
  // Orders status and count
  const statusBreakdown: Record<string, number> = {}
  for (const order of ordersByStatus) {
    statusBreakdown[order.status] = order._count.id
  }

  // Total pending earnings (Non delivered orders)
  const totalPendingEarnings = pendingEarnings.reduce(
    (sum, item) => sum + Number(item.price.toString()) * item.quantity,
    0
  )

  // Total earnings from delivered orders
  const totalEarnings = totalDeliveredOrders.reduce(
    (sum, item) => sum + Number(item.price.toString()) * item.quantity,
    0
  )

  // Calculate commission & net earnings
  const commissionDeducted = totalEarnings * 0.025 //2.5% commission
  const netVendorEarnings = totalEarnings - commissionDeducted

  return {
    products: {
      totalProducts,
      byStatus: productStatusBreakdown,
      productsList,
    },
    orders: {
      total: totalOrders,
      byStatus: statusBreakdown,
    },
    financial: {
      totalEarnings: totalEarnings || 0,
      totalPendingEarnings,
      platformCommission: commissionDeducted || 0,
      netVendorEarnings: netVendorEarnings || 0,
    },
    codOrders: pendingCodOrders,
  }
}

// Get vendor orders - paginated and filtered by status
const getVendorOrders = async (
  userId: string,
  page: number,
  limit: number,
  skip: number,
  sort: string,
  status?: OrderStatus
) => {
  const { id: vendorId } = await checkExistingAccount('vendor', userId)

  const where: Prisma.OrderWhereInput = {
    items: {
      some: {
        product: {
          vendorId, //find all orders that contains this vendorId
        },
      },
    },
  }

  if (status) {
    where.status = status
  }
  const [vendorOrders, totalOrders] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
      select: {
        id: true, //orderID
        status: true,
        items: {
          where: {
            product: {
              vendorId, //select orderItems only from this vendorID
            },
          },
          select: {
            //orderItem details
            id: true,
            price: true,
            quantity: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ])

  return {
    vendorOrders,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalOrders / limit),
    },
  }
}

//Get customer list -> paginated and filtered
const getCustomerList = async (
  userId: string,
  page: number,
  limit: number,
  skip: number,
  sort: string,
  division?: string,
  district?: string
) => {
  const { id: vendorId } = await checkExistingAccount('vendor', userId)

  const where: Prisma.GuestCustomerWhereInput = {
    orders: {
      some: {
        items: {
          some: {
            product: {
              vendorId, //find all customers for this vendor
            },
          },
        },
      },
    },
  }

  if (division || district) {
    where.address = {}
    if (division) {
      where.address.division = { name: division }
    }
    if (district) {
      where.address.district = { name: district }
    }
  }

  const [customers, totalCustomer] = await Promise.all([
    prisma.guestCustomer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: {
          select: {
            area: true,
            district: { select: { name: true } },
            division: { select: { name: true } },
          },
        },
      },
    }),
    prisma.guestCustomer.count({ where }),
  ])

  return {
    customers,
    pagination: {
      page,
      limit,
      totalCustomer,
      totalPages: Math.ceil(totalCustomer / limit),
    },
  }
}

// Set vendor's delivery charge
export const setDeliveryCharge = async (
  userId: string,
  insideCharge: number,
  outsideCharge: number
) => {
  const { id: vendorId } = await checkExistingAccount('vendor', userId)

  const result = await prisma.$transaction(tx =>
    upsertVendorDeliveryCharge(tx, vendorId, { insideCharge, outsideCharge })
  )

  const { default: redis } = await import('../../../config/redis.config.js')
  await redis.del(`delivery_charge:${vendorId}`)

  return result
}

// Get social links
const getSocialLinks = async (userId: string) => {
  const { id: vendorId } = await checkExistingAccount('vendor', userId)
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { socialLinks: true },
  })
  return vendor?.socialLinks || { facebook: '', instagram: '', youtube: '', whatsapp: '' }
}

// Update social links
const updateSocialLinks = async (userId: string, socialLinks: any) => {
  const { id: vendorId } = await checkExistingAccount('vendor', userId)
  const result = await prisma.vendor.update({
    where: { id: vendorId },
    data: { socialLinks },
    include: { customDomain: true },
  })

  const { default: redis } = await import('../../../config/redis.config.js')
  if (result.subDomain) {
    await redis.del(`vendor_profile:${result.subDomain}`)
  }
  if (result.customDomain?.domain) {
    await redis.del(`vendor_profile:${result.customDomain.domain}`)
  }

  return result.socialLinks
}

export const VendorDashboardService = {
  vendorDashboardStats,
  getVendorOrders,
  getCustomerList,
  setDeliveryCharge,
  getSocialLinks,
  updateSocialLinks,
}
