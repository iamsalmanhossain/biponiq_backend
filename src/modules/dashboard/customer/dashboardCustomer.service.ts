import status from 'http-status'
import { prisma } from '../../../lib/prisma.js'
import AppError from '../../../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'

const customerDashboardStats = async (customerId: string) => {
  // Get customer profile data
  const user = await prisma.guestCustomer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
    },
  })

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found')
  }

  const { id, name, email, address } = user

  // Order query by customer id
  const orders = await prisma.order.findMany({
    where: { guestCustomerId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      totalPrice: true,
      status: true,

    },
  })

  return {
    profile: {
      id,
      name,
      email,
      address,
    },
    orders: {
      count: orders.length,
      list: orders,
    },
  }
}

// Customer per order breakdown
const getOrderDetail = async (customerId: string) => {
  const customer = await prisma.guestCustomer.findUnique({
    where: {
      id: customerId,
    },
  })
  if (!customer) throw new AppError(status.NOT_FOUND, 'Customer not found!')

  const order = await prisma.order.findMany({
    where: {
      guestCustomerId: customerId,
    },
    select: {
      id: true,

      totalPrice: true,
      status: true,

      items: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              images: true,
            },
          },
          quantity: true,
        },
      },
      payment: {
        select: {
          paymentMethod: true,
          paymentStatus: true,
        },
      },
    },
  })

  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Order not found')
  }

  return {
    order,
  }
}

export const CustomerDashboardService = {
  customerDashboardStats,
  getOrderDetail,
}
