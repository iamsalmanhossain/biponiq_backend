import {
  AdminAccountStatus,
  Prisma,
  VendorAccountStatus,
  OrderStatus,
} from '@prisma/client'
import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'
import { checkExistingAccount } from '../../../shared/utils/checkExistingAccount.js'


export const adminDashboardStats = async (userId: string) => {
  // 1. Authenticate and verify admin access
  await checkExistingAccount('admin', userId);

  // ---------------------------------------------------------
  // Date Boundaries
  // ---------------------------------------------------------
  const now = new Date();
  const currentYear = now.getFullYear();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const startOfYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

  const startOf30DaysAgo = new Date(startOfToday);
  startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 29);

  // ---------------------------------------------------------
  // All DB Queries in Parallel
  // ---------------------------------------------------------
  const [
    // --- Overview KPI ---
    totalVendors,
    totalCustomers,
    totalProducts,
    totalSubscriptionRevenueAgg,
    totalAffiliateProfitAgg,
    totalCashoutChargesAgg,
    totalCashoutPendingAgg,
    activeSubscriptionsCount,
    pendingAffiliatePayoutCount,
    pendingVendorCashoutCount,

    // --- Vendor Registration ---
    vendorsByStatus,
    vendorsByPlan,
    dailyNewVendors,
    monthlyNewVendors,
    yearlyNewVendors,
    last30DaysVendorRegs,
    yearlyVendorRegs,

    // --- Subscription Stats ---
    subscriptionsByStatus,
    last10SubscriptionPayments,

    // --- Affiliate Stats ---
    totalAffiliates,
    activeAffiliates,
    totalAffiliateCommissionPaidAgg,
    yearlyAffiliateData,

    // --- Coupon Stats ---
    totalCoupons,
    activeCoupons,
    expiredCoupons,
    totalCouponUsed,
    totalDiscountGivenAgg,

    // --- Domain Stats ---
    customDomainsByStatus,
    purchasedDomainsByStatus,

    // --- Cashout Stats ---
    totalCashoutPendingCountReq,
    cashoutPendingAmountAgg,
    cashoutCompletedAmountAgg,
    cashoutRejectedAmountAgg,
  ] = await Promise.all([

    // ── Overview KPIs ────────────────────────────────────────

    // মোট vendor (deleted নয়)
    prisma.vendor.count({ where: { user: { isDeleted: false } } }),

    // মোট customer
    prisma.guestCustomer.count(),

    // মোট product
    prisma.product.count(),

    // Subscription revenue — PAID payment এর finalAmount যোগফল
    prisma.subscriptionPayment.aggregate({
      where: { paymentStatus: 'PAID' },
      _sum: { finalAmount: true, amount: true },
    }),

    // Affiliate profit — affiliate coupon এর কারণে subscription payment এ affiliateEarning
    prisma.subscriptionPayment.aggregate({
      where: { paymentStatus: 'PAID', coupon: { affiliateId: { not: null } } },
      _sum: { affiliateEarning: true },
    }),

    // Cashout charge — admin এর income, COMPLETED cashout এ chargeAmount
    prisma.vendorCashout.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { chargeAmount: true },
    }),

    // Vendor cashout pending মোট পরিমাণ
    prisma.vendorCashout.aggregate({
      where: { status: 'PENDING' },
      _sum: { requestedAmount: true },
    }),

    // Active subscription count
    prisma.vendorSubscription.count({ where: { status: 'ACTIVE' } }),

    // Pending affiliate payout request count
    prisma.affiliatePayout.count({ where: { status: 'PENDING' } }),

    // Pending vendor cashout request count
    prisma.vendorCashout.count({ where: { status: 'PENDING' } }),

    // ── Vendor Registration ──────────────────────────────────

    // Vendor status breakdown (ACTIVE/SUSPENDED/BLOCKED/CLOSED)
    prisma.vendor.groupBy({ by: ['accountStatus'], _count: { id: true } }),

    // Vendor plan breakdown (FREE_TRIAL/STANDARD/MEDIUM/PREMIUM...)
    prisma.vendor.groupBy({ by: ['subscriptionPlanType'], _count: { id: true } }),

    // আজকের নতুন vendor
    prisma.user.count({
      where: { role: 'VENDOR', isDeleted: false, createdAt: { gte: startOfToday, lte: endOfToday } },
    }),

    // এই মাসের নতুন vendor
    prisma.user.count({
      where: { role: 'VENDOR', isDeleted: false, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),

    // এই বছরের নতুন vendor
    prisma.user.count({
      where: { role: 'VENDOR', isDeleted: false, createdAt: { gte: startOfYear, lte: endOfYear } },
    }),

    // গত ৩০ দিনের vendor registration (30-day chart)
    prisma.user.findMany({
      where: { role: 'VENDOR', isDeleted: false, createdAt: { gte: startOf30DaysAgo, lte: endOfToday } },
      select: { createdAt: true },
    }),

    // এই বছরের vendor registration (12-month chart)
    prisma.user.findMany({
      where: { role: 'VENDOR', isDeleted: false, createdAt: { gte: startOfYear, lte: endOfYear } },
      select: { createdAt: true },
    }),

    // ── Subscription Stats ───────────────────────────────────

    // Subscription status breakdown
    prisma.vendorSubscription.groupBy({ by: ['status'], _count: { id: true } }),

    // সর্বশেষ ১০টি PAID subscription payment
    prisma.subscriptionPayment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      where: { paymentStatus: 'PAID' },
      select: {
        id: true,
        amount: true,
        finalAmount: true,
        discountAmount: true,
        billingCycle: true,
        paymentMethod: true,
        purpose: true,
        paidAt: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            shopName: true,
            vendorCode: true,
            avatar: true,
            subscriptionPlanType: true,
            user: { select: { name: true, email: true } },
          },
        },
        subscription: {
          select: {
            plan: { select: { name: true, type: true } },
            startDate: true,
            endDate: true,
          },
        },
      },
    }),

    // ── Affiliate Stats ──────────────────────────────────────

    // মোট affiliate
    prisma.affiliate.count(),

    // Active affiliate (কমপক্ষে একটি paid subscription এনেছে)
    prisma.affiliate.count({
      where: {
        adminCoupons: {
          some: { payments: { some: { paymentStatus: 'PAID' } } },
        },
      },
    }),

    // মোট affiliate commission যা COMPLETED payout হয়েছে
    prisma.affiliatePayout.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    }),

    // এই বছরে affiliate coupon এর মাধ্যমে subscription payment data (monthly chart এর জন্য)
    prisma.subscriptionPayment.findMany({
      where: {
        paymentStatus: 'PAID',
        coupon: { affiliateId: { not: null } },
        createdAt: { gte: startOfYear, lte: endOfYear },
      },
      select: { createdAt: true, vendorId: true, affiliateEarning: true },
    }),

    // ── Coupon Stats ─────────────────────────────────────────

    // মোট coupon (deleted নয়)
    prisma.coupon.count({ where: { isDeleted: false } }),

    // Active coupon (expire হয়নি, isActive true)
    prisma.coupon.count({
      where: { isDeleted: false, isActive: true, expiresAt: { gte: now } },
    }),

    // Expired coupon
    prisma.coupon.count({ where: { isDeleted: false, expiresAt: { lt: now } } }),

    // মোট কতবার coupon ব্যবহার হয়েছে
    prisma.couponUsage.count(),

    // মোট কত ছাড় দেওয়া হয়েছে
    prisma.couponUsage.aggregate({ _sum: { discountAmount: true } }),

    // ── Domain Stats ─────────────────────────────────────────

    // Custom domain status breakdown
    prisma.customDomain.groupBy({ by: ['status'], _count: { id: true } }),

    // Purchased domain status breakdown
    prisma.purchasedDomain.groupBy({ by: ['status'], _count: { id: true } }),

    // ── Cashout Stats ────────────────────────────────────────

    // Pending cashout request count
    prisma.vendorCashout.count({ where: { status: 'PENDING' } }),

    // Pending cashout মোট পরিমাণ
    prisma.vendorCashout.aggregate({
      where: { status: 'PENDING' },
      _sum: { requestedAmount: true },
    }),

    // Completed cashout মোট পরিমাণ (vendor কে দেওয়া)
    prisma.vendorCashout.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { payoutAmount: true },
    }),

    // Rejected cashout মোট পরিমাণ
    prisma.vendorCashout.aggregate({
      where: { status: 'REJECTED' },
      _sum: { requestedAmount: true },
    }),
  ]);

  // ---------------------------------------------------------
  // In-Memory Processing
  // ---------------------------------------------------------
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // --- Overview Revenue Calculation ---
  const totalSubscriptionRevenue =
    Number(totalSubscriptionRevenueAgg._sum.finalAmount) ||
    Number(totalSubscriptionRevenueAgg._sum.amount) || 0;
  const totalAffiliateProfitGenerated = Number(totalAffiliateProfitAgg._sum.affiliateEarning) || 0;
  const totalVendorCashoutCharges = Number(totalCashoutChargesAgg._sum.chargeAmount) || 0;
  const totalRevenue = totalSubscriptionRevenue + totalAffiliateProfitGenerated + totalVendorCashoutCharges;
  const totalVendorCashoutPending = Number(totalCashoutPendingAgg._sum.requestedAmount) || 0;

  // --- Vendor Breakdowns ---
  const vendorStatusBreakdown: Record<string, number> = {};
  for (const g of vendorsByStatus) vendorStatusBreakdown[g.accountStatus] = g._count.id;

  const vendorPlanBreakdown: Record<string, number> = {};
  for (const g of vendorsByPlan) vendorPlanBreakdown[g.subscriptionPlanType] = g._count.id;

  // --- Vendor 30-day Registration Trend ---
  const last30DaysVendorMap: Record<string, { date: string; vendors: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    last30DaysVendorMap[key] = { date: key, vendors: 0 };
  }
  for (const u of last30DaysVendorRegs) {
    const key = new Date(u.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    if (last30DaysVendorMap[key]) last30DaysVendorMap[key]!.vendors += 1;
  }

  // --- Vendor 12-month Yearly Trend ---
  const yearlyVendorTrend = monthNames.map((name) => ({ name, vendors: 0 }));
  for (const u of yearlyVendorRegs) {
    yearlyVendorTrend[new Date(u.createdAt).getMonth()]!.vendors += 1;
  }

  // --- Subscription Status Breakdown ---
  const subscriptionStatusBreakdown: Record<string, number> = {};
  for (const g of subscriptionsByStatus) subscriptionStatusBreakdown[g.status] = g._count.id;

  // --- Affiliate Monthly Trend ---
  const affiliateMonthlyTrend = monthNames.map((name) => ({ name, vendorsBrought: 0, commission: 0 }));
  const seenVendorsByMonth: Record<number, Set<string>> = {};
  for (const p of yearlyAffiliateData) {
    const idx = new Date(p.createdAt).getMonth();
    if (!seenVendorsByMonth[idx]) seenVendorsByMonth[idx] = new Set();
    seenVendorsByMonth[idx]!.add(p.vendorId);
    affiliateMonthlyTrend[idx]!.commission += Number(p.affiliateEarning) || 0;
  }
  for (const [idx, vendorSet] of Object.entries(seenVendorsByMonth)) {
    affiliateMonthlyTrend[Number(idx)]!.vendorsBrought = vendorSet.size;
  }
  const totalVendorsBroughtViaAffiliate = new Set(yearlyAffiliateData.map((p) => p.vendorId)).size;
  const totalAffiliateCommissionPaid = Number(totalAffiliateCommissionPaidAgg._sum.amount) || 0;
  const totalAffiliateCommissionPending = Math.max(0, totalAffiliateProfitGenerated - totalAffiliateCommissionPaid);

  // --- Domain Breakdowns ---
  const customDomainStatusBreakdown: Record<string, number> = {};
  for (const g of customDomainsByStatus) customDomainStatusBreakdown[g.status] = g._count.id;
  const totalCustomDomains = Object.values(customDomainStatusBreakdown).reduce((a, b) => a + b, 0);

  const purchasedDomainStatusBreakdown: Record<string, number> = {};
  for (const g of purchasedDomainsByStatus) purchasedDomainStatusBreakdown[g.status] = g._count.id;
  const totalPurchasedDomains = Object.values(purchasedDomainStatusBreakdown).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------
  // Final Return
  // ---------------------------------------------------------
  return {
    // 1. Platform Overview KPI Cards
    overview: {
      totalVendors,
      totalCustomers,
      totalProducts,
      totalSubscriptionRevenue,
      totalAffiliateProfitGenerated,
      totalVendorCashoutCharges,
      totalRevenue,
      totalVendorCashoutPending,
      activeSubscriptions: activeSubscriptionsCount,
      pendingAffiliatePayout: pendingAffiliatePayoutCount,
      pendingVendorCashout: pendingVendorCashoutCount,
    },

    // 2. Vendor Registration Stats
    vendorRegistration: {
      daily: {
        date: startOfToday.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }),
        newVendors: dailyNewVendors,
      },
      monthly: {
        month: startOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        newVendors: monthlyNewVendors,
      },
      yearly: {
        year: currentYear,
        newVendors: yearlyNewVendors,
      },
      vendorsByStatus: vendorStatusBreakdown,
      vendorsByPlan: vendorPlanBreakdown,
      last30DaysTrend: Object.values(last30DaysVendorMap),
      yearlyTrend: yearlyVendorTrend,
    },

    // 3. Subscription Stats
    subscriptionStats: {
      totalRevenue: totalSubscriptionRevenue,
      activeSubscriptions: activeSubscriptionsCount,
      byStatus: subscriptionStatusBreakdown,
      recentPayments: last10SubscriptionPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        finalAmount: p.finalAmount,
        discountAmount: p.discountAmount,
        billingCycle: p.billingCycle,
        paymentMethod: p.paymentMethod,
        purpose: p.purpose,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        plan: p.subscription?.plan
          ? { name: p.subscription.plan.name, type: p.subscription.plan.type }
          : null,
        subscriptionPeriod: p.subscription
          ? { startDate: p.subscription.startDate, endDate: p.subscription.endDate }
          : null,
        vendor: {
          id: p.vendor.id,
          shopName: p.vendor.shopName,
          vendorCode: p.vendor.vendorCode,
          avatar: p.vendor.avatar,
          currentPlan: p.vendor.subscriptionPlanType,
          ownerName: p.vendor.user.name,
          ownerEmail: p.vendor.user.email,
        },
      })),
    },

    // 4. Affiliate Stats
    affiliateStats: {
      totalAffiliates,
      activeAffiliates,
      totalVendorsBroughtViaAffiliate,
      totalAffiliateCommissionPaid,
      totalAffiliateCommissionPending,
      pendingPayoutRequests: pendingAffiliatePayoutCount,
      monthlyTrend: affiliateMonthlyTrend,
    },

    // 5. Coupon Stats
    couponStats: {
      totalCoupons,
      activeCoupons,
      expiredCoupons,
      totalTimesUsed: totalCouponUsed,
      totalDiscountGiven: Number(totalDiscountGivenAgg._sum.discountAmount) || 0,
    },

    // 6. Domain Stats
    domainStats: {
      totalCustomDomains,
      customDomainsByStatus: customDomainStatusBreakdown,
      totalPurchasedDomains,
      purchasedDomainsByStatus: purchasedDomainStatusBreakdown,
    },

    // 7. Vendor Cashout Stats
    cashoutStats: {
      totalPendingRequests: totalCashoutPendingCountReq,
      totalPendingAmount: Number(cashoutPendingAmountAgg._sum.requestedAmount) || 0,
      totalCompletedAmount: Number(cashoutCompletedAmountAgg._sum.payoutAmount) || 0,
      totalChargeCollected: totalVendorCashoutCharges,
      totalRejectedAmount: Number(cashoutRejectedAmountAgg._sum.requestedAmount) || 0,
    },
  };
}

//Vendor list- paginated and filtered
const getVendorList = async (
  userId: string,
  page: number,
  limit: number,
  skip: number,
  status?: VendorAccountStatus,
  division?: string,
  district?: string,
  search?: string
) => {
  await checkExistingAccount('admin', userId)

  // Vendor list filter
  const where: Prisma.VendorWhereInput = {
    user: {
      isDeleted: false,
    },
  }

  // Statistics filter
  const statisticsWhere: Prisma.VendorWhereInput = {
    user: {
      isDeleted: false,
    },
  }

  if (status && (status as string) !== 'ALL') {
    where.accountStatus = status
  }

  if (division || district) {
    where.address = {}
    statisticsWhere.address = {}

    if (division) {
      where.address.division = {
        name: division,
      }
      statisticsWhere.address.division = {
        name: division,
      }
    }

    if (district) {
      where.address.district = {
        name: district,
      }
      statisticsWhere.address.district = {
        name: district,
      }
    }
  }


  if (search) {
    const searchFilter: Prisma.VendorWhereInput = {
      OR: [
        { shopName: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    }

    where.OR = searchFilter.OR!
    statisticsWhere.OR = searchFilter.OR!
  }


  const [
    vendors,
    totalVendor,
    totalActiveVendor,
    totalSuspendedVendor,
    totalBlockedVendor,
    totalSubdomains,
    totalCustomDomains,
    totalVisitors,
  ] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        vendorCode: true,
        shopName: true,
        accountStatus: true,
        shopLogo: true,
        subDomain: true,

        customDomain: {
          select: {
            domain: true,
            status: true,
          }
        },

        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
          },
        },

        _count: {
          select: {
            products: true,
            visitorTrackings: true,
          },
        },

        products: {
          select: {
            _count: {
              select: {
                orderItems: true,
              },
            },
          },
        },

      },
    }),

    prisma.vendor.count({
      where: statisticsWhere,
    }),

    prisma.vendor.count({
      where: {
        ...statisticsWhere,
        accountStatus: VendorAccountStatus.ACTIVE,
      },
    }),

    prisma.vendor.count({
      where: {
        ...statisticsWhere,
        accountStatus: VendorAccountStatus.SUSPENDED,
      },
    }),

    prisma.vendor.count({
      where: {
        ...statisticsWhere,
        accountStatus: VendorAccountStatus.BLOCKED,
      },
    }),

    prisma.vendor.count({
      where: {
        subDomain: { not: '' },
        user: { isDeleted: false },
      },
    }),

    prisma.customDomain.count(),

    prisma.visitorTracking.count(),
  ])

  const formattedVendors = vendors.map((vendor) => {
    const totalOrders = vendor.products.reduce(
      (sum, product) => sum + product._count.orderItems,
      0
    )

    return {
      id: vendor.id,
      shopName: vendor.shopName,
      accountStatus: vendor.accountStatus,
      shopLogo: vendor.shopLogo,
  
      subDomain: vendor.subDomain,
      customDomain: vendor.customDomain ? {
        domain: vendor.customDomain.domain,
        status: vendor.customDomain.status,
      } : null,
      user: {
        id: vendor.user.id,
        email: vendor.user.email,
        name: vendor.user.name,
        avatar: vendor.user.avatar,
        vendorCode: vendor.vendorCode,
      },
      totalProducts: vendor._count.products,
      totalOrders,
      totalVisitors: vendor._count.visitorTrackings,
    }
  })

  return {
    vendors: formattedVendors,
    pagination: {
      page,
      limit,
      totalVendor,
      totalActiveVendor,
      totalSuspendedVendor,
      totalBlockedVendor,
      totalSubdomains,
      totalCustomDomains,
      totalVisitors,
      totalPages: Math.ceil(totalVendor / limit),
    },
  }
}

// get guest customer list -> paginated and filtered
const getGuestCustomerList = async (
  userId: string,
  page: number,
  limit: number,
  skip: number,
  division?: string,
  district?: string,
  search?: string
) => {
  await checkExistingAccount('admin', userId)

  const where: Prisma.GuestCustomerWhereInput = {}

  // ১. Dropdown/Specific filters (Jodi division ba district select kora thake)
  if (division || district) {
    where.address = {}
    if (division) {
      where.address.division = { name: division }
    }
    if (district) {
      where.address.district = { name: district }
    }
  }

  // ২. Global Search Implementation (Name, Email, Area, District, Division)
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } }, // Phone soho khunjar jonno safe keeping
      {
        address: {
          OR: [
            { area: { contains: search, mode: 'insensitive' } },
            { division: { name: { contains: search, mode: 'insensitive' } } },
            { district: { name: { contains: search, mode: 'insensitive' } } },
          ],
        },
      },
    ]
  }

  const [customers, totalCustomer] = await Promise.all([
    prisma.guestCustomer.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: {
          select: {
            area: true,
            division: {
              select: {
                name: true,
              },
            },
            district: {
              select: {
                name: true,
              },
            },
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

// UPDATE ADMIN ACCOUNT STATUS
const updateAdminAccountStatus = async (id: string, userId: string, status: AdminAccountStatus) => {
  const currentAdmin = await checkExistingAccount('admin', userId)

  const admin = await prisma.admin.findUnique({
    where: {
      id,
    },
  })

  if (!admin) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Invalid Admin Id')
  }

  if (admin.id === currentAdmin.id) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You Cannot Update Your Own Account Status!')
  }

  const updateStatus = await prisma.admin.update({
    where: {
      id,
    },
    data: {
      adminAccountStatus: status,
    },
  })

  return updateStatus
}

const getAffiliatesPerformance = async (
  userId: string,
  page: number,
  limit: number,
  skip: number,
  search?: string
) => {
  await checkExistingAccount('admin', userId)

  const where: Prisma.AffiliateWhereInput = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [affiliates, totalAffiliate] = await Promise.all([
    prisma.affiliate.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        adminCoupons: {
          select: {
            id: true,
            code: true,
            payments: {
              where: {
                paymentStatus: 'PAID',
              },
              select: {
                vendorId: true,
                affiliateEarning: true,
              },
            },
          },
        },
      },
    }),
    prisma.affiliate.count({ where }),
  ])

  // Map data to calculate total vendors and total commission
  const formattedAffiliates = affiliates.map((affiliate) => {
    let totalCommissionEarned = 0
    const uniqueVendors = new Set<string>()

    affiliate.adminCoupons.forEach((coupon) => {
      coupon.payments.forEach((payment) => {
        totalCommissionEarned += payment.affiliateEarning || 0
        uniqueVendors.add(payment.vendorId)
      })
    })

    return {
      id: affiliate.id,
      name: affiliate.name,
      email: affiliate.email,
      phone: affiliate.phone,
      createdAt: affiliate.createdAt,
      totalVendorsBrought: uniqueVendors.size,
      totalCommissionEarned,
    }
  })

  // 1. Total Affiliates
  const totalAffiliateCount = await prisma.affiliate.count()

  // 2. Active Affiliates (those with at least 1 paid payment from their coupons)
  const activeAffiliatesCount = await prisma.affiliate.count({
    where: {
      adminCoupons: {
        some: {
          payments: {
            some: {
              paymentStatus: 'PAID',
            },
          },
        },
      },
    },
  })

  // 3. Total Earn & Total Commission
  const paymentsAgg = await prisma.subscriptionPayment.aggregate({
    where: {
      paymentStatus: 'PAID',
      coupon: {
        affiliateId: { not: null },
      },
    },
    _sum: {
      finalAmount: true,
      amount: true,
      affiliateEarning: true,
    },
  })

  const totalEarn = paymentsAgg._sum.finalAmount || paymentsAgg._sum.amount || 0
  const totalCommission = paymentsAgg._sum.affiliateEarning || 0

  // 4. Pending Payout Requests
  const pendingPayoutRequestsCount = await prisma.affiliatePayout.count({
    where: {
      status: 'PENDING',
    },
  })

  return {
    affiliates: formattedAffiliates,
    summaryStats: {
      totalAffiliates: totalAffiliateCount,
      activeAffiliates: activeAffiliatesCount,
      totalEarn,
      totalCommission,
      pendingPayoutRequests: pendingPayoutRequestsCount,
    },
    pagination: {
      page,
      limit,
      totalAffiliate,
      totalPages: Math.ceil(totalAffiliate / limit),
    },
  }
}

const getAffiliatePayoutRequests = async (
  userId: string,
  query: { page?: number; limit?: number; status?: string; search?: string }
) => {
  await checkExistingAccount('admin', userId)

  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const skip = (page - 1) * limit

  const where: Prisma.AffiliatePayoutWhereInput = {}

  if (query.status) {
    where.status = query.status
  }

  if (query.search) {
    where.affiliate = {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } }
      ]
    }
  }

  const [payouts, total] = await Promise.all([
    prisma.affiliatePayout.findMany({
      where,
      include: {
        affiliate: {
          select: {
            name: true,
            email: true,
            phone: true,
            payoutMethods: {
              select: {
                methodType: true,
                accountNumber: true
              }
            }
          }
        }
      },
      orderBy: { payoutDate: 'desc' },
      skip,
      take: limit
    }),
    prisma.affiliatePayout.count({ where })
  ])

  return {
    payouts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  }
}

const approveAffiliatePayout = async (
  userId: string,
  payoutId: string,
  payload: { status: string; transactionId?: string; rejectionReason?: string; gatewayResponseCode?: string }
) => {
  await checkExistingAccount('admin', userId)

  const payout = await prisma.affiliatePayout.findUnique({
    where: { id: payoutId }
  })

  if (!payout) throw new AppError(StatusCodes.NOT_FOUND, 'Payout request not found')
  if (payout.status !== 'PENDING') throw new AppError(StatusCodes.BAD_REQUEST, 'Payout is already processed')

  if (payload.status === 'PAID' || payload.status === 'COMPLETED' || payload.status === 'APPROVED') {
    return prisma.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: 'COMPLETED',
        transactionId: payload.transactionId || payload.gatewayResponseCode || `TXN-${Date.now()}`,
        gatewayResponse: 'SUCCESS'
      }
    })
  } else {
    return prisma.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: 'REJECTED',
        gatewayResponse: payload.gatewayResponseCode || payload.rejectionReason || 'REJECTED_BY_ADMIN'
      }
    })
  }
}

const getVendorDetails = async (userId: string, vendorId: string) => {
  await checkExistingAccount('admin', userId)

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId, user: { isDeleted: false } },
    select: {
      id: true,
      vendorCode: true,
      shopName: true,
      shopLogo: true,
      accountStatus: true,
      
      subDomain: true,
      subscriptionPlanType: true,
      activeDomainType: true,
      isOnboardingComplete: true,
      adminFraudCheckUsageCount: true,
      customDomain: { select: { domain: true, status: true } },
      address: {
        select: {
          district: { select: { name: true } },
          division: { select: { name: true } }
        }
      },
      subscriptions: {
        select: {
          plan: {
            select: {
              id: true,
              name: true,
              nameBn: true,
              type: true,
              isActive: true,
              isTrial: true,
              displayOrder: true,
              isMostPopular: true,
              description: true,
              descriptionBn: true,
              createdAt: true,
              updatedAt: true,
              prices: {
                select: {
                  billingCycle: true,
                  price: true,
                  discountPercent: true,
                  durationDays: true,
                  isActive: true,
                },
              },
            },
          },
          status: true,
          startDate: true,
          endDate: true,
          billingCycle: true,
          amountPaid: true,
          assignedByAdmin: true,
          customDays: true,
          createdAt: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar:true,
          isVerified: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true
        },
      },
      _count: {
        select: {
          products: true,
          visitorTrackings: true,
        },
      },
      products: {
        select: {
          id: true,
          productId: true,
          name: true,
          stock: true,
          price: true,
          _count: { select: { orderItems: true } },
          orderItems: {
            select: {
              id: true,
              quantity: true,
              price: true,
              order: {
                select: {
                  id: true,
                  orderId: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    }
  })

  if (!vendor) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  }

  const orders = vendor.products.flatMap((product) =>
    product.orderItems.map((item) => ({
      orderId: item.order.orderId || item.order.id,
      orderStatus: item.order.status,
      orderDate: item.order.createdAt,
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      price: item.price,
    }))
  )

  const totalEarning = vendor.products.reduce(
    (vendorSum, product) =>
      vendorSum +
      product.orderItems
        .filter((item) => item.order.status === OrderStatus.DELIVERED || item.order.status === OrderStatus.COMPLETED)
        .reduce(
          (itemSum, item) => itemSum + Number(item.price) * item.quantity,
          0
        ),
    0
  )

  // Current active/trial subscription er price
  const activeSubscription = vendor.subscriptions.find(
    (s) => s.status === 'ACTIVE' || s.status === 'TRIAL'
  )
  const currentPackagePrice = activeSubscription
    ? (activeSubscription.plan.prices.find(
      (p) => p.billingCycle === activeSubscription.billingCycle
    )?.price ?? 0)
    : 0

  // Total amount spent on all packages
  const totalAmountSpent = vendor.subscriptions.reduce(
    (sum, s) => sum + (s.amountPaid ?? 0),
    0
  )

  return {
    id: vendor.id,
    shopName: vendor.shopName,
    shopLogo: vendor.shopLogo,
    accountStatus: vendor.accountStatus,
    avatar: vendor.user.avatar,
    subDomain: vendor.subDomain,
    subscriptionPlanType: vendor.subscriptionPlanType,
    activeDomainType: vendor.activeDomainType,
    isOnboardingComplete: vendor.isOnboardingComplete,
    adminFraudCheckUsageCount: vendor.adminFraudCheckUsageCount,
    customDomain: vendor.customDomain,
    district: vendor.address?.district ?? null,
    division: vendor.address?.division ?? null,
    subscriptions: activeSubscription ? [{
      ...activeSubscription,
      amountPaid: activeSubscription.assignedByAdmin ? 'Trial' : activeSubscription.amountPaid,
      plan: {
        id: activeSubscription.plan.id,
        name: activeSubscription.plan.name,
        nameBn: activeSubscription.plan.nameBn,
        type: activeSubscription.plan.type,
        isActive: activeSubscription.plan.isActive,
        isTrial: activeSubscription.plan.isTrial,
      }
    }] : [],
    currentPackagePrice,
    totalAmountSpent,
    user: {
      ...vendor.user,
      vendorCode: vendor.vendorCode,
    },
    totalProducts: vendor._count.products,
    totalVisitors: vendor._count.visitorTrackings,
    totalOrders: orders.length,
    totalEarning,
    orders,
    products: vendor.products.map((product) => ({
      id: product.productId || product.id,
      name: product.name,
      stock: product.stock,
      price: product.price,
      totalOrders: product._count.orderItems,
    })),
  }
}

export const AdminDashboardService = {
  adminDashboardStats,
  getVendorList,
  getVendorDetails,
  getGuestCustomerList,
  updateAdminAccountStatus,
  getAffiliatesPerformance,
  getAffiliatePayoutRequests,
  approveAffiliatePayout,
}
