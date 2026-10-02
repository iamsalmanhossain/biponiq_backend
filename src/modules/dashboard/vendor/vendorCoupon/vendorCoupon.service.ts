import { prisma } from '../../../../lib/prisma.js'
import { Prisma, CouponDiscountType } from '@prisma/client'
import AppError from '../../../../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'
import bcrypt from 'bcrypt'
import { CreateVendorCouponPayload, UpdateVendorCouponPayload } from './vendorCoupon.schema.js'


// vendro create coupon
const createVendorCoupon = async (vendorId: string, payload: CreateVendorCouponPayload) => {
  const { affiliateEmail, affiliateName, affiliatePassword, ...couponData } = payload

   // vendorId 
   const vendor = await prisma.vendor.findUnique({
        where: { userId: vendorId }
    })

    if (!vendor) throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')

  // Check if coupon code already exists for this vendor
  const existingCoupon = await prisma.vendorCoupon.findFirst({
    where: { code: couponData.code, vendorId: vendor.id }, 
  })

  if (existingCoupon) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Coupon code already exists')
  }

  // 1. Check if Affiliate exists
  let affiliate = await prisma.affiliate.findUnique({ where: { email: affiliateEmail } })

  // If affiliate does not exist, create one with the vendor-provided password or a default
  if (!affiliate) {
    const rawPassword = affiliatePassword ?? '12345678'
    const hashedPassword = await bcrypt.hash(rawPassword, 10)
    affiliate = await prisma.affiliate.create({
      data: {
        name: affiliateName,
        email: affiliateEmail,
        password: hashedPassword,
        vendorId: vendor.id,
      },
    })
  } else if (affiliate.vendorId !== vendor.id) {
    throw new AppError(StatusCodes.FORBIDDEN, 'This affiliate email belongs to another vendor')
  }

  const createData: Prisma.VendorCouponUncheckedCreateInput = {
    code: couponData.code,
    discountType: couponData.discountType,
    discountValue: couponData.discountValue,
    maxDiscountAmount: couponData.maxDiscountAmount ?? null,
    minimumAmount: couponData.minimumAmount ?? null,
    usageLimit: couponData.usageLimit ?? null,
    isActive: couponData.isActive ?? true,
    affiliateCommissionType: couponData.affiliateCommissionType as CouponDiscountType ?? "PERCENTAGE",
    affiliateCommissionValue: couponData.affiliateCommissionValue ?? 0,
    startsAt: new Date(couponData.startsAt),
    expiresAt: new Date(couponData.expiresAt),
    vendorId: vendor.id, 
    affiliateId: affiliate.id,
  }

  if (couponData.applicableTemplateIds && couponData.applicableTemplateIds.length > 0) {
    (createData as any).applicableTemplates = {
      connect: couponData.applicableTemplateIds.map(id => ({ id }))
    }
  }

  // 3. Create Coupon
  const coupon = await prisma.vendorCoupon.create({
    data: createData,
  })

  return coupon
}

const getVendorCoupons = async (
  vendorId: string,
  page: number,
  limit: number,
  skip: number,
  sort: string,
  search: string
) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: vendorId },
  });

  if (!vendor) throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found');

  const where: Prisma.VendorCouponWhereInput = { vendorId: vendor.id };

  if (search) {
    where.code = { contains: search, mode: 'insensitive' };
  }

  // ডায়নামিক সর্টিং লজিক 
  // যদি sort="-createdAt" হয়, তাহলে descending। আর যদি sort="createdAt" হয়, তাহলে ascending।
  let orderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' }; // ডিফল্ট সর্ট
  if (sort) {
    const isDesc = sort.startsWith('-');
    const sortBy = isDesc ? sort.substring(1) : sort;
    orderBy = { [sortBy]: isDesc ? 'desc' : 'asc' };
  }

  const [coupons, total, activeCouponsCount, statsResult] = await prisma.$transaction([
    prisma.vendorCoupon.findMany({
      where,
      skip,
      take: limit,
      orderBy, // ডায়নামিক sort ভ্যালু এখানে পাস করা হলো
      select: { 
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxDiscountAmount: true,
        minimumAmount: true,
        usageLimit: true,
        isActive: true,
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
        startsAt: true,
        expiresAt: true,
        vendorId: true,
        affiliateId: true,
        applicableTemplates: { select: { id: true, name: true } },
        affiliate: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.vendorCoupon.count({ where }),
    prisma.vendorCoupon.count({ 
      where: { vendorId: vendor.id, isActive: true, expiresAt: { gt: new Date() } } 
    }),
    prisma.vendorCoupon.aggregate({
      where: { vendorId: vendor.id },
      _sum: {
        usedCount: true,
      }
    })
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    summary: {
      totalCoupons: total,
      activeCoupons: activeCouponsCount,
      totalRedemptions: statsResult._sum.usedCount || 0,
      discountGiven: 0,
    },
    data: coupons,
  };
};

const getVendorCouponById = async (vendorId: string, couponId: string) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: vendorId } })
  if (!vendor) throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')

  const coupon = await prisma.vendorCoupon.findFirst({
    where: { id: couponId, vendorId: vendor.id },
    include: {
      affiliate: { select: { id: true, name: true, email: true } },
      applicableTemplates: { select: { id: true, name: true } }
    },
  })

  if (!coupon) throw new AppError(StatusCodes.NOT_FOUND, 'Coupon not found')
  return coupon
}

const updateVendorCoupon = async (userId: string, couponId: string, payload: UpdateVendorCouponPayload) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId } })

  if (!vendor || vendor.userId !== userId ) throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  
  const coupon = await prisma.vendorCoupon.findFirst({
    where: { id: couponId, vendorId: vendor.id },
  })

  if (!coupon) throw new AppError(StatusCodes.NOT_FOUND, 'Coupon not found')

  const updateData: Prisma.VendorCouponUpdateInput = {}

  if (payload.discountType !== undefined) updateData.discountType = payload.discountType as CouponDiscountType
  if (payload.discountValue !== undefined) updateData.discountValue = payload.discountValue
  if (payload.maxDiscountAmount !== undefined) updateData.maxDiscountAmount = payload.maxDiscountAmount
  if (payload.minimumAmount !== undefined) updateData.minimumAmount = payload.minimumAmount
  if (payload.usageLimit !== undefined) updateData.usageLimit = payload.usageLimit
  if (payload.isActive !== undefined) updateData.isActive = payload.isActive
  if (payload.affiliateCommissionType !== undefined) updateData.affiliateCommissionType = payload.affiliateCommissionType as CouponDiscountType
  if (payload.affiliateCommissionValue !== undefined) updateData.affiliateCommissionValue = payload.affiliateCommissionValue
  if (payload.startsAt !== undefined) updateData.startsAt = new Date(payload.startsAt)
  if (payload.expiresAt !== undefined) updateData.expiresAt = new Date(payload.expiresAt)
  if (payload.applicableTemplateIds !== undefined) {
    updateData.applicableTemplates = {
      set: payload.applicableTemplateIds.map(id => ({ id }))
    }
  }

  return prisma.vendorCoupon.update({
    where: { id: couponId },
    data: updateData,
  })
}

const deleteVendorCoupon = async (userId: string, couponId: string) => {
  const vendor = await prisma.vendor.findUnique({where:{userId:userId}})
  if(!vendor) throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')

  const coupon = await prisma.vendorCoupon.findFirst({
    where: { id: couponId, vendorId: vendor.id },
  })

  if (!coupon) throw new AppError(StatusCodes.NOT_FOUND, 'Coupon not found')

  return prisma.vendorCoupon.delete({
    where: { id: couponId },
  })
}

export const VendorCouponService = {
  createVendorCoupon,
  getVendorCoupons,
  getVendorCouponById,
  updateVendorCoupon,
  deleteVendorCoupon,
}
