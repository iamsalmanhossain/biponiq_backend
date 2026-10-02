import redis from '../../config/redis.config.js'
import { prisma } from '../../lib/prisma.js'
import { OrderStatus, VendorAccountStatus } from '@prisma/client'
import AppError from '../../shared/errors/AppError.js'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
// get all vendor
const getAllVendor = async (
  page: number,
  limit: number,
  skip: number,
  accountStatus: VendorAccountStatus
) => {
  const where = {
    ...(accountStatus && { accountStatus }),
    user: {
      isDeleted: false,
    },
  }

  const [data, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        updatedAt: 'desc',
      },

      select: {
        id: true,
        shopName: true,
        shopLogo: true,
        subDomain: true,
        accountStatus: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
      },
    }),

    prisma.vendor.count({ where }),
  ])

  return {
    meta: { page, limit, total },
    data,
  }
}
// get trash vendors
const getTrashVendor=async(page:number, limit:number, skip:number)=>{
 const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      skip,
      take: limit,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        user: true,
      },
    }),

    prisma.vendor.count(),
  ]);

  const trashVendors = vendors.filter(
    (v) => v.user?.isDeleted === true
  );

  return {
    meta: {
      page,
      limit,
      total: trashVendors.length,
    },
    data: trashVendors,
  };

}

// update vendor status
const updateVendorStatus = async (id: string, payload: { accountStatus: VendorAccountStatus }) => {
  const result = await prisma.vendor.update({
    where: {
      id,
    },
    data: {
      accountStatus: payload.accountStatus,
    },
    select: {
      id: true,
      accountStatus: true,
    },
  })
  return result
}

// vendor soft delete
const deleteVendor = async (vendorId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      userId: true,
    },
  })

  if (!vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  await prisma.user.update({
    where: { id: vendor.userId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  })

  return {
    success: true,
    message: 'Vendor  delete successful',
    data: {
      id: vendorId,
      isDeleted: true,
    },
  }
}

// restore vendor
const restoreVendor = async (vendorId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      userId: true,
    },
  })

  if (!vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  await prisma.user.update({
    where: { id: vendor.userId },
    data: {
      isDeleted: false,
      deletedAt: null,
    },
  })

  return {
    success: true,
    message: 'Vendor restored successfully',
    data: {
      id: vendor.userId,
      isDeleted: false,
    },
  }
}

// get vendor stats

const getAllOrders = async (page: number, limit: number, skip: number, status: OrderStatus) => {
  const where = status ? { status } : {}

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        totalPrice: true,
        status: true,

        guestCustomer:{
          select:{
            name:true,
            email:true,
            phone:true
          }
        },

        createdAt: true,
        updatedAt: true,
      },
    }),

    prisma.order.count({ where }),
  ])

  return {
    meta: { page, limit, total },
    data,
  }
}

// total stats
const getVendorStats = async (vendorId: string) => {
  
  const cacheKey = `admin_vendor_stats:${vendorId}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const vendor = await prisma.vendor.findUnique({
    where: {
      id: vendorId,
    },
  })
  if (!vendor) {
    throw new Error('vendor not found')
  }
  // product cound
  let productCount = 0
  try {
    productCount = await prisma.product.count({
      where: { vendorId },
    })
  } catch (error) {
    console.error(`[Admin] Failed to count products for vendor ${vendorId}:`, error)
  }
  // order and earnings
  let totalOrders = 0
  let totalEarnings = 0
  try {
    const orders = await prisma.orderItem.findMany({
      where: {
        product: {
          vendorId,
        },
      },
    })
    totalOrders = orders.length

    totalEarnings = orders.reduce((sum: number, order: any) => {
      return sum + (order.totalPrice || 0)
    }, 0) //convert earnings schema
  } catch (error) {
    console.error(`[Admin] Failed to fetch orders for vendor ${vendorId}:`, error)
  }
  
  const result = {
    vendorId,
    shopName: vendor.shopName,
    status: vendor.accountStatus,
    totalOrders,
    totalEarnings,
    productCount,
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 900)
  return result
}

// admin impersonate vendor — credential ছাড়াই vendor account এ login
const impersonateVendor = async (vendorId: string, adminId: string) => {
  // 1. Vendor DB তে আছে কিনা এবং active কিনা check করো
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      shopName: true,
      subDomain: true,
      shopLogo: true,
      avatar: true,
      accountStatus: true,
      isOnboardingComplete: true,
      vendorCode: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isDeleted: true,
        },
      },
    },
  })

  if (!vendor) {
    throw new AppError(404, 'Vendor not found')
  }

  if (vendor.user.isDeleted) {
    throw new AppError(403, 'This vendor account has been deleted')
  }

  // 2. Vendor এর user data দিয়ে short-lived impersonation token তৈরি করো
  //    এই token এ impersonatedBy রাখা হয় audit trail এর জন্য
  const impersonationToken = jwt.sign(
    {
      id: vendor.user.id,
      email: vendor.user.email,
      role: vendor.user.role,
      name: vendor.user.name,
      avatar: vendor.avatar ?? vendor.shopLogo ?? null,
      impersonatedBy: adminId, // কোন admin করেছে সেটা log করা হলো
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' } // মাত্র ১ ঘণ্টা valid — security এর জন্য
  )

  // 3. DB তে log save করো — admin panel এ দেখানোর জন্য
  await prisma.impersonationLog.create({
    data: {
      adminId,   // কোন admin এর userId
      vendorId,  // কোন vendor এর id
    },
  })

  return {
    impersonationToken,
    vendor: {
      id: vendor.id,
      shopName: vendor.shopName,
      email: vendor.user.email,
    },
  }
}

// admin panel এ impersonation logs দেখানোর জন্য
// কোন admin কোন vendor account এ কখন ঢুকেছে
const getImpersonationLogs = async (page: number, limit: number, skip: number) => {
  const [data, total] = await Promise.all([
    prisma.impersonationLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        // কোন admin করেছে
        adminUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        // কোন vendor এর account এ
        vendor: {
          select: {
            id: true,
            shopName: true,
            subDomain: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.impersonationLog.count(),
  ])

  return {
    meta: { page, limit, total },
    data,
  }
}

export const AdminService = {
  getAllVendor,
  getTrashVendor,
  updateVendorStatus,
  deleteVendor,
  restoreVendor,
  getAllOrders,
  getVendorStats,
  impersonateVendor,
  getImpersonationLogs,
}
