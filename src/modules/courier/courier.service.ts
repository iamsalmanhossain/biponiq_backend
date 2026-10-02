import { CourierProvider } from '@prisma/client'
import { StatusCodes } from 'http-status-codes'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import {
  decryptCredentials,
  encryptCredentials,
} from '../../shared/utils/crypto.utils.js'
import { CourierFactory } from './courier.factory.js'
import {
  CourierOrderPayload,
  GetCourierOrdersQuery,
  SaveCourierCredentialsDto,
} from './courier.types.js'

export class CourierService {
  /**
   * Helper to get actual Vendor model primary key (id) from either Vendor ID or User ID
   */
  private static async resolveVendorId(idOrUserId: string): Promise<string> {
    const vendor = await prisma.vendor.findFirst({
      where: {
        OR: [{ id: idOrUserId }, { userId: idOrUserId }],
      },
      select: { id: true },
    })

    if (!vendor) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Vendor profile not found')
    }

    return vendor.id
  }

  /**
   * Save or update vendor courier credentials
   */
  static async saveCredentials(
    idOrUserId: string,
    payload: SaveCourierCredentialsDto
  ) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const { provider, credentials, isEnabled = true, isDefault = false } = payload

    // Validate credentials structure using factory instance before encryption
    try {
      const courierInstance = CourierFactory.getCourierInstance(
        provider,
        credentials
      )
      if (!courierInstance) {
        throw new Error('Failed to initialize courier client')
      }
    } catch (err: any) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Invalid credentials for ${provider}: ${err.message}`
      )
    }

    // Encrypt sensitive credential fields before storing in database
    const encryptedCredentials = encryptCredentials(credentials)

    // If default is set to true, clear default status on other couriers for this vendor
    if (isDefault) {
      await prisma.vendorCourier.updateMany({
        where: { vendorId },
        data: { isDefault: false },
      })
    }

    // Upsert courier credentials in database
    const savedCourier = await prisma.vendorCourier.upsert({
      where: {
        vendorId_provider: {
          vendorId,
          provider,
        },
      },
      update: {
        credentials: encryptedCredentials,
        isEnabled,
        isDefault,
      },
      create: {
        vendorId,
        provider,
        credentials: encryptedCredentials,
        isEnabled,
        isDefault,
      },
    })

    return savedCourier
  }

  /**
   * Get all couriers configured by a vendor
   */
  static async getVendorCouriers(idOrUserId: string) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const couriers = await prisma.vendorCourier.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
    })

    return couriers.map((c) => ({
      id: c.id,
      provider: c.provider,
      isEnabled: c.isEnabled,
      isDefault: c.isDefault,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      hasCredentials: Boolean(c.credentials && Object.keys(c.credentials as object).length > 0),
    }))
  }

  /**
   * Get list of active/available couriers for delivery for a vendor
   */
  static async getAvailableCouriersForVendor(idOrUserId: string) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const activeCouriers = await prisma.vendorCourier.findMany({
      where: {
        vendorId,
        isEnabled: true,
      },
      select: {
        id: true,
        provider: true,
        isDefault: true,
        createdAt: true,
      },
    })

    return activeCouriers
  }

  /**
   * Delete or disable vendor courier credentials
   */
  static async deleteCredentials(idOrUserId: string, provider: CourierProvider) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const existing = await prisma.vendorCourier.findUnique({
      where: {
        vendorId_provider: {
          vendorId,
          provider,
        },
      },
    })

    if (!existing) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        `Courier credentials for ${provider} not found`
      )
    }

    await prisma.vendorCourier.delete({
      where: {
        vendorId_provider: {
          vendorId,
          provider,
        },
      },
    })

    return { message: `Courier credentials for ${provider} removed successfully` }
  }

  /**
   * Create order / parcel with a specified courier service and persist dispatch data
   */
  static async createOrder(
    idOrUserId: string,
    provider: CourierProvider,
    orderPayload: CourierOrderPayload
  ) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const vendorCourier = await prisma.vendorCourier.findUnique({
      where: {
        vendorId_provider: {
          vendorId,
          provider,
        },
      },
    })

    if (!vendorCourier || !vendorCourier.isEnabled) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Courier service ${provider} is not configured or enabled for this vendor.`
      )
    }

    const rawCredentials = vendorCourier.credentials as Record<string, any>
    const credentials = decryptCredentials(rawCredentials)
    const courierInstance = CourierFactory.getCourierInstance(
      provider,
      credentials
    )

    // Attempt to match and resolve an existing order in database
    let resolvedOrder = null
    if (orderPayload.orderId) {
      resolvedOrder = await prisma.order.findUnique({
        where: { id: orderPayload.orderId },
        select: { id: true, orderId: true },
      })
    }

    if (!resolvedOrder && orderPayload.invoice) {
      resolvedOrder = await prisma.order.findFirst({
        where: {
          OR: [
            { id: orderPayload.invoice },
            { orderId: orderPayload.invoice },
          ],
        },
        select: { id: true, orderId: true },
      })
    }

    const response = await courierInstance.createOrder(orderPayload)
    if (!response.success) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        response.message || `Failed to create order on ${provider}`
      )
    }

    // Persist courier dispatch details in database
    const savedCourierOrder = await prisma.courierOrder.create({
      data: {
        vendorId,
        orderId: resolvedOrder?.id ?? null,
        provider,
        consignmentId: response.consignmentId ? String(response.consignmentId) : null,
        trackingCode: response.trackingCode ? String(response.trackingCode) : null,
        status: response.status || 'created',
        invoice: orderPayload.invoice,
        recipientName: orderPayload.recipientName,
        recipientPhone: orderPayload.recipientPhone,
        recipientAddress: orderPayload.recipientAddress,
        codAmount: Number(orderPayload.codAmount) || 0,
        rawResponse: response.rawResponse as any,
        metadata: {
          note: orderPayload.note,
          itemDescription: orderPayload.itemDescription,
          deliveryAreaId: orderPayload.deliveryAreaId,
          cityId: orderPayload.cityId,
          zoneId: orderPayload.zoneId,
          areaId: orderPayload.areaId,
          recipientSecondaryPhone: orderPayload.recipientSecondaryPhone,
          storeId: orderPayload.storeId,
          deliveryType: orderPayload.deliveryType,
          itemType: orderPayload.itemType,
          itemWeight: orderPayload.itemWeight,
          itemQuantity: orderPayload.itemQuantity,
          isClosedBox: orderPayload.isClosedBox,
          isExchange: orderPayload.isExchange,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderId: true,
            status: true,
            totalPrice: true,
          },
        },
      },
    })

    return {
      ...response,
      courierOrder: savedCourierOrder,
    }
  }

  /**
   * Check delivery status of a parcel and update persisted dispatch record
   */
  static async checkDeliveryStatus(
    idOrUserId: string,
    provider: CourierProvider,
    trackingCodeOrCid: string
  ) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const vendorCourier = await prisma.vendorCourier.findUnique({
      where: {
        vendorId_provider: {
          vendorId,
          provider,
        },
      },
    })

    if (!vendorCourier || !vendorCourier.isEnabled) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Courier service ${provider} is not configured or enabled for this vendor.`
      )
    }

    const rawCredentials = vendorCourier.credentials as Record<string, any>
    const credentials = decryptCredentials(rawCredentials)
    const courierInstance = CourierFactory.getCourierInstance(
      provider,
      credentials
    )

    const statusResponse = await courierInstance.checkDeliveryStatus(
      trackingCodeOrCid
    )

    // Sync updated status to database record if exists
    let matchingCourierOrder = await prisma.courierOrder.findFirst({
      where: {
        vendorId,
        provider,
        OR: [
          { consignmentId: trackingCodeOrCid },
          { trackingCode: trackingCodeOrCid },
        ],
      },
    })

    if (matchingCourierOrder && statusResponse.status && statusResponse.status !== 'error') {
      matchingCourierOrder = await prisma.courierOrder.update({
        where: { id: matchingCourierOrder.id },
        data: {
          status: statusResponse.status,
          rawResponse: statusResponse.rawResponse as any,
        },
      })
    }

    return {
      ...statusResponse,
      courierOrder: matchingCourierOrder,
    }
  }

  /**
   * Get paginated list of courier dispatches / orders for a vendor
   */
  static async getCourierOrders(
    idOrUserId: string,
    query: GetCourierOrdersQuery
  ) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const {
      page = 1,
      limit = 10,
      provider,
      status,
      searchTerm,
      orderId,
    } = query

    const safePage = Math.max(1, page)
    const safeLimit = Math.min(Math.max(1, limit), 100)
    const skip = (safePage - 1) * safeLimit

    const where: any = { vendorId }

    if (provider) {
      where.provider = provider
    }

    if (status) {
      where.status = { contains: status, mode: 'insensitive' }
    }

    if (orderId) {
      where.orderId = orderId
    }

    if (searchTerm) {
      where.OR = [
        { invoice: { contains: searchTerm, mode: 'insensitive' } },
        { trackingCode: { contains: searchTerm, mode: 'insensitive' } },
        { consignmentId: { contains: searchTerm, mode: 'insensitive' } },
        { recipientName: { contains: searchTerm, mode: 'insensitive' } },
        { recipientPhone: { contains: searchTerm, mode: 'insensitive' } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.courierOrder.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderId: true,
              status: true,
              totalPrice: true,
            },
          },
        },
      }),
      prisma.courierOrder.count({ where }),
    ])

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNextPage: safePage * safeLimit < total,
        hasPrevPage: safePage > 1,
      },
    }
  }

  /**
   * Get single courier order by its ID
   */
  static async getCourierOrderById(idOrUserId: string, id: string) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const courierOrder = await prisma.courierOrder.findFirst({
      where: {
        id,
        vendorId,
      },
      include: {
        order: {
          select: {
            id: true,
            orderId: true,
            status: true,
            totalPrice: true,
            deliveryCharge: true,
            address: true,
            guestCustomer: true,
          },
        },
      },
    })

    if (!courierOrder) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Courier order not found')
    }

    return courierOrder
  }

  /**
   * Get courier dispatches for a specific platform order
   */
  static async getCourierOrdersByOrderId(idOrUserId: string, orderId: string) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const courierOrders = await prisma.courierOrder.findMany({
      where: {
        vendorId,
        orderId,
      },
      orderBy: { createdAt: 'desc' },
    })

    return courierOrders
  }

  /**
   * Check account balance for a courier service
   */
  static async getBalance(idOrUserId: string, provider: CourierProvider) {
    const vendorId = await this.resolveVendorId(idOrUserId)
    const vendorCourier = await prisma.vendorCourier.findUnique({
      where: {
        vendorId_provider: {
          vendorId,
          provider,
        },
      },
    })

    if (!vendorCourier || !vendorCourier.isEnabled) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Courier service ${provider} is not configured or enabled for this vendor.`
      )
    }

    const rawCredentials = vendorCourier.credentials as Record<string, any>
    const credentials = decryptCredentials(rawCredentials)
    const courierInstance = CourierFactory.getCourierInstance(
      provider,
      credentials
    )

    const balanceResponse = await courierInstance.getBalance()
    return balanceResponse
  }
}


