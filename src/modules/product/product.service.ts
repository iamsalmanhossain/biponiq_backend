import redis from '../../config/redis.config.js'
import httpStatus from 'http-status'
import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import sanitizeHtml from 'sanitize-html'
import { Prisma, ProductStatus, SubscriptionPlanType, VendorAccountStatus } from '@prisma/client'
import type { CreateProduct, UpdateProduct } from './product.validation.js'
import crypto from 'crypto'
import { TPaginationReturn } from '../../shared/pagination/pagination.types.js'
import { TFilterReturn, TAdminProductFilterReturn } from '../../shared/filter/filter.types.js'

const invalidateProductCache = async (vendorId?: string) => {
  await redis.incr('products:version')

  if (vendorId) {
    const fullVendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { subDomain: true, customDomain: { select: { domain: true, status: true } } },
    })

    if (fullVendor) {
      const { CloudflareService } = await import('../../shared/utils/cloudflare.service.js')
      const hostsToPurge = []
      if (fullVendor.subDomain) hostsToPurge.push(`${fullVendor.subDomain}.biponiq.com`)
      if (fullVendor.customDomain?.status === 'VERIFIED' && fullVendor.customDomain.domain) {
        hostsToPurge.push(fullVendor.customDomain.domain)
      }
      if (hostsToPurge.length > 0) {
        await CloudflareService.purgeCacheByHostnames(hostsToPurge)
      }
    }
  }
}

const generateProductId = (): string => {
  const date = new Date()
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `PROD-${yearMonth}-${randomStr}`
}

const sanitizeDescription = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'a',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
          ...(attribs.href && /^javascript:/i.test(attribs.href) ? { href: '#' } : {}),
        },
      }),
    },
  })

const PRODUCT_LIMIT = 6

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  stock: true,
  status: true,
  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,

  images: {
    select: {
      id: true,
      imageUrl: true,
      imageName: true,
      imageKey: true,
    },
  },

  vendor: {
    select: {
      id: true,
      shopName: true,
    },
  },
}

const getVendorByUserId = async (tx: Prisma.TransactionClient, userId: string) => {
  const vendor = await tx.vendor.findUnique({
    where: { userId },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
  }

  if (vendor.accountStatus !== VendorAccountStatus.ACTIVE) {
    throw new AppError(httpStatus.FORBIDDEN, 'Vendor is not active')
  }

  return vendor
}

const getVendorProductCount = async (tx: Prisma.TransactionClient, vendorId: string) => {
  return tx.product.count({
    where: { vendorId, isDeleted: false },
  })
}

const createProduct = async (payload: CreateProduct, userId: string) => {
  return prisma.$transaction(async (tx) => {
    const vendor = await getVendorByUserId(tx, userId)

    if (!vendor) {
      throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
    }

    if (vendor.subscriptionPlanType === SubscriptionPlanType.NO_PLAN) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You must activate a subscription plan to create products'
      )
    }

    const totalProducts = await tx.product.count({
      where: {
        vendorId: vendor.id,
        status: {
          in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK],
        },
        isDeleted: false,
      },
    })

    if (totalProducts >= PRODUCT_LIMIT) {
      throw new AppError(httpStatus.FORBIDDEN, `Maximum ${PRODUCT_LIMIT} products allowed`)
    }

    const existingSlug = await tx.product.findUnique({
      where: { slug: payload.slug },
    })

    if (existingSlug) {
      throw new AppError(httpStatus.CONFLICT, 'Product slug already exists')
    }

    const uniqueImages = Array.from(new Set((payload.images ?? []).filter(Boolean)))

    const description = payload.description ? sanitizeDescription(payload.description) : null

      const product = await tx.product.create({
      data: {
        productId: generateProductId(),
        name: payload.name,
        slug: payload.slug,
        description,
        price: payload.price,
        stock: payload.stock,
        vendorId: vendor.id,

        ...(uniqueImages.length > 0 && {
          images: {
            create: uniqueImages.map((imageUrl) => ({
              imageUrl,
              imageKey: imageUrl,
              width: 0,
              height: 0,
              size: 0,
              mimeType: 'image/jpeg'
            })),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        stock: true,
        status: true,
        isDeleted: true,
        deletedAt: true,
        vendorId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await invalidateProductCache()
    return product
  })
}

const getProductsByAdmin = async (
  filters: TAdminProductFilterReturn,
  pagination: TPaginationReturn
) => {
  const { page, limit, skip } = pagination

  const where: Prisma.ProductWhereInput = {}

  if (filters.status) {
    where.status = filters.status
  }

  if (typeof filters.isDeleted === 'boolean') {
    where.isDeleted = filters.isDeleted
  }

  if (filters.phone) {
    where.vendor = {
      user: {
        // You can use `equals: filters.phone` for an exact match
        // or `contains: filters.phone` for a partial search.
        phone: {
          contains: filters.phone,
        },
      },
    }
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      select: productSelect,
    }),

    prisma.product.count({ where }),
  ])

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: products,
  }
}

const getPublicProducts = async (filters: TFilterReturn, pagination: TPaginationReturn) => {
  const { page, limit, skip } = pagination
  const { search, minPrice, maxPrice, subDomain, identifier } = filters

  const version = (await redis.get('products:version')) || '0'
  const cacheKey = `products:public:v${version}:${identifier || subDomain || 'all'}:p${page}:l${limit}:s${search || ''}:min${minPrice || ''}:max${maxPrice || ''}`

  const cachedData = await redis.get(cacheKey)
  if (cachedData) {
    return JSON.parse(cachedData)
  }

  const where: Prisma.ProductWhereInput = {
    isDeleted: false,
    status: {
      not: ProductStatus.INACTIVE,
    },

    vendor: {
      accountStatus: VendorAccountStatus.ACTIVE,
      ...(subDomain !== undefined && {
        subDomain,
        customDomain: null,
      }),
      ...(identifier !== undefined && {
        OR: [
          { subDomain: identifier, customDomain: null },
          { customDomain: { domain: identifier } },
        ],
      }),
    },
  }

  if (search) {
    // Point 22: Track search keywords in Redis Sorted Sets for Autocomplete
    const keyword = search.trim().toLowerCase()
    if (keyword.length > 2) {
      await redis.zincrby(`search_keywords:${identifier || subDomain || 'global'}`, 1, keyword)
    }

    where.OR = [
      {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: search,
          mode: 'insensitive',
        },
      },
    ]
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {
      ...(minPrice !== undefined && { gte: minPrice }),
      ...(maxPrice !== undefined && { lte: maxPrice }),
    }
  }

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: {
        images: {
          select: {
            id: true,
            imageUrl: true,
            imageName: true,
            imageKey: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),

    prisma.product.count({ where }),
  ])

  const result = {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data,
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600)

  return result
}

const getVendorProducts = async (userId: string, filters?: { status?: ProductStatus }) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
  })

  if (!vendor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Vendor not found')
  }

  return prisma.product.findMany({
    where: {
      vendorId: vendor.id,
      isDeleted: false,

      ...(filters?.status && {
        status: filters.status,
      }),
    },
    include: {
      images: {
        select: {
          id: true,
          imageUrl: true,
          imageName: true,
          imageKey: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

const getProduct = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: {
      id,
    },
    include: {
      images: {
        select: {
          id: true,
          imageUrl: true,
          imageName: true,
          imageKey: true,
        },
      },
    },
  })

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found')
  }

  if (product.status !== ProductStatus.ACTIVE) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found')
  }

  return product
}

const updateProduct = async (id: string, payload: UpdateProduct) => {
  const existingProduct = await prisma.product.findUnique({
    where: {
      id,
    },
  })

  if (!existingProduct) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found')
  }

  if (payload.slug) {
    const existingSlug = await prisma.product.findFirst({
      where: {
        slug: payload.slug,

        NOT: {
          id,
        },
      },
    })

    if (existingSlug) {
      throw new AppError(httpStatus.CONFLICT, 'Product slug already exists')
    }
  }

  const updateData: any = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => value !== undefined && key !== 'images')
  )

  if (payload.images !== undefined) {
    const uniqueImages = Array.from(new Set(payload.images.filter(Boolean)))
    updateData.images = {
      deleteMany: {},
      ...(uniqueImages.length > 0 && {
        create: uniqueImages.map((imageUrl) => ({
          imageUrl,
        })),
      }),
    }
  }

  if (typeof updateData.description === 'string') {
    updateData.description = sanitizeDescription(updateData.description)
  }

  if (payload.stock !== undefined) {
    const newStock = payload.stock

    if (newStock === 0) {
      updateData.status = ProductStatus.OUT_OF_STOCK
    } else if (existingProduct.status === ProductStatus.OUT_OF_STOCK && newStock > 0) {
      updateData.status = ProductStatus.ACTIVE
    }

    const finalStatus = (updateData.status as ProductStatus | undefined) ?? existingProduct.status

    if (finalStatus === ProductStatus.ACTIVE && newStock <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Active products must have stock greater than 0')
    }
  }

  const result = await prisma.product.update({
    where: { id },
    data: updateData,
    select: productSelect,
  })

  await invalidateProductCache()
  return result
}

const restoreProductByAdmin = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: {
      id,
    },
  })

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found')
  }

  if (!product.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Product is not deleted')
  }

  const vendorRelevantProductCount = await prisma.product.count({
    where: {
      vendorId: product.vendorId,
      status: {
        in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK],
      },
    },
  })

  let status: ProductStatus

  if (product.stock <= 0) {
    status = ProductStatus.OUT_OF_STOCK
  } else if (vendorRelevantProductCount < 6) {
    status = ProductStatus.ACTIVE
  } else {
    status = ProductStatus.INACTIVE
  }

  const result = await prisma.product.update({
    where: {
      id,
    },
    data: {
      status,
      isDeleted: false,
    },
    select: productSelect,
  })

  await invalidateProductCache()
  return result
}

const deleteProduct = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: {
      id,
    },
  })

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found')
  }

  if (product.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Already deleted')
  }

  const result = await prisma.product.update({
    where: {
      id,
    },

    data: {
      isDeleted: true,
      deletedAt: new Date(),
      status: ProductStatus.INACTIVE,
    },
  })

  await invalidateProductCache()
  return result
}

const validateProductOrderability = async (
  productId: string,
  quantity: number
): Promise<boolean> => {
  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },

    select: {
      id: true,
      isDeleted: true,
      stock: true,
      status: true,

      vendor: {
        select: {
          accountStatus: true,
        },
      },
    },
  })

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found')
  }

  if (product.isDeleted || product.status === ProductStatus.INACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Product is unavailable')
  }

  if (product.vendor.accountStatus !== VendorAccountStatus.ACTIVE) {
    throw new AppError(httpStatus.FORBIDDEN, 'Vendor is not active')
  }

  if (product.stock < quantity) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      product.stock === 0 ? 'Product out of stock' : 'Insufficient stock'
    )
  }

  return true
}

const reduceStockAfterCompletedOrder = async (
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<boolean> => {
  const execute = async (client: Prisma.TransactionClient) => {
    const order = await client.order.findUnique({
      where: {
        id: orderId,
      },

      select: {
        items: true,
      },
    })

    if (!order) {
      throw new AppError(httpStatus.NOT_FOUND, 'Order not found')
    }

    for (const item of order.items) {
      const result = await client.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity },
        },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      })

      if (result.count === 0) {
        throw new AppError(httpStatus.CONFLICT, `Insufficient stock for product ${item.productId}`)
      }
    }

    const updatedProducts = await client.product.findMany({
      where: {
        id: {
          in: order.items.map((item) => item.productId),
        },
      },

      select: {
        id: true,
        stock: true,
      },
    })

    for (const product of updatedProducts) {
      if (product.stock === 0) {
        await client.product.update({
          where: {
            id: product.id,
          },

          data: {
            status: ProductStatus.OUT_OF_STOCK,
          },
        })
      }
    }
  }

  if (tx) {
    await execute(tx)
  } else {
    await prisma.$transaction(async (innerTx) => {
      await execute(innerTx)
    })
  }

  await invalidateProductCache()
  return true
}

const restockAfterCancelledOrder = async (orderId: string): Promise<boolean> => {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { items: true },
    })

    if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found')

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    }

    const updatedProducts = await tx.product.findMany({
      where: { id: { in: order.items.map((item) => item.productId) } },
      select: { id: true, stock: true, status: true },
    })

    for (const product of updatedProducts) {
      if (product.stock > 0 && product.status === ProductStatus.OUT_OF_STOCK) {
        await tx.product.update({
          where: { id: product.id },
          data: { status: ProductStatus.ACTIVE },
        })
      }
    }
  })

  await invalidateProductCache()
  return true
}

const getSearchSuggestions = async (identifier?: string) => {
  const key = `search_keywords:${identifier || 'global'}`
  return redis.zrevrange(key, 0, 9)
}

export const ProductService = {
  createProduct,
  getProductsByAdmin,
  getProduct,
  updateProduct,
  restoreProductByAdmin,
  deleteProduct,
  getVendorProducts,
  getPublicProducts,
  getVendorProductCount,
  reduceStockAfterCompletedOrder,
  restockAfterCancelledOrder,
  validateProductOrderability,
  getSearchSuggestions,
}
