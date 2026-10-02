import { PaymentMethod, PaymentStatus, SubscriptionPaymentPurpose } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'
import { nanoid } from 'nanoid'
import { getPaymentProvider } from '../payment/providers/payment-provider.registry.js'
import { PaymentProviderAvailabilityService } from '../payment/providers/payment-provider-availability.service.js'
import { OnlinePaymentProvider } from '../payment/providers/payment-provider.types.js'

// Admin features
const createPackage = async (payload: { name: string, visitorLimit: number, price: number }) => {
  return prisma.visitorLimitPackage.create({
    data: payload
  })
}

const updatePackage = async (id: string, payload: { name?: string, visitorLimit?: number, price?: number, isActive?: boolean }) => {
  const pkg = await prisma.visitorLimitPackage.findUnique({ where: { id } })
  if (!pkg) throw new AppError(StatusCodes.NOT_FOUND, 'Package not found')

  return prisma.visitorLimitPackage.update({
    where: { id },
    data: payload
  })
}

const deletePackage = async (id: string) => {
  const pkg = await prisma.visitorLimitPackage.findUnique({ where: { id } })
  if (!pkg) throw new AppError(StatusCodes.NOT_FOUND, 'Package not found')

  return prisma.visitorLimitPackage.delete({
    where: { id }
  })
}

const getAllPackagesForAdmin = async () => {
  return prisma.visitorLimitPackage.findMany({
    orderBy: { createdAt: 'desc' },
    select:{
      id: true,
      name: true,
      visitorLimit: true,
      price: true,
      isActive: true,
    }
  })
}

// Vendor features
const getPackages = async () => {
  return prisma.visitorLimitPackage.findMany({
    where: { isActive: true },
    orderBy: { price: 'asc' },
     select:{
      id: true,
      name: true,
      visitorLimit: true,
      price: true,
    }
  })
}

const checkout = async (vendorId: string, packageId: string, paymentMethod: PaymentMethod = PaymentMethod.SSLCOMMERZ) => {
  const pkg = await prisma.visitorLimitPackage.findUnique({
    where: { id: packageId, isActive: true },
  })
  
  if (!pkg) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Visitor limit package not found or inactive')
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { user: true, address: { include: { division: true, district: true } } }
  })

  if (!vendor || !vendor.user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found')
  }

  await PaymentProviderAvailabilityService.assertPaymentProviderAvailable(paymentMethod as OnlinePaymentProvider)
  const paymentProvider = getPaymentProvider(paymentMethod as OnlinePaymentProvider)

  const transactionId = nanoid()

  const payment = await prisma.subscriptionPayment.create({
    data: {
      vendorId,
      amount: pkg.price,
      originalAmount: pkg.price,
      finalAmount: pkg.price,
      transactionId,
      paymentStatus: PaymentStatus.PENDING,
      purpose: SubscriptionPaymentPurpose.VISITOR_LIMIT_TOPUP,
      visitorLimitPackageId: pkg.id,
      paymentMethod,
    }
  })

  const customerCity = vendor.address?.district?.name || 'Dhaka'
  const customerState = vendor.address?.division?.name || 'Dhaka'
  const customerAddress = vendor.address ? `${vendor.address.area}, ${customerCity}, ${customerState}` : 'N/A'

  const paymentResult = await paymentProvider.initiate({
    transactionId,
    amount: pkg.price,
    customer: {
      name: vendor.user.name,
      email: vendor.user.email,
      phone: vendor.user.phone || '01711111111',
      address: customerAddress,
      city: customerCity,
      state: customerState
    },
    ...(paymentMethod === PaymentMethod.EPS
      ? {
          product: {
            name: pkg.name,
            category: 'Topup',
          },
        }
      : {}),
  })

  if (paymentResult.gatewayData) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { gatewayData: paymentResult.gatewayData }
    })
  }

  return {
    paymentUrl: paymentResult.gatewayPageURL,
  }
}

const applyTopupAfterPayment = async (subscriptionPaymentId: string) => {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: subscriptionPaymentId },
      include: { visitorLimitPackage: true }
    })

    if (!payment || payment.purpose !== SubscriptionPaymentPurpose.VISITOR_LIMIT_TOPUP) {
      return
    }

    if (!payment.visitorLimitPackage) {
      throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, 'Package details missing in payment')
    }

    const currentSubscription = await tx.vendorSubscription.findFirst({
      where: { vendorId: payment.vendorId },
      orderBy: { createdAt: 'desc' }
    })

    if (currentSubscription) {
      await tx.vendorSubscription.update({
        where: { id: currentSubscription.id },
        data: {
          visitorLimit: (currentSubscription.visitorLimit || 0) + payment.visitorLimitPackage.visitorLimit
        }
      })
    }

    await tx.subscriptionPayment.update({
      where: { id: subscriptionPaymentId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date()
      }
    })
  })
}

export const VisitorLimitTopupService = {
  createPackage,
  updatePackage,
  deletePackage,
  getAllPackagesForAdmin,
  getPackages,
  checkout,
  applyTopupAfterPayment
}
