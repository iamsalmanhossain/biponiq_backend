import { Prisma, Documentation } from '@prisma/client'
import { CreateDocumentationDto, UpdateDocumentationDto } from './documentation.dto.js'
import { prisma } from '../../lib/prisma.js'

const createDocumentation = async (payload: CreateDocumentationDto): Promise<Documentation> => {
  const result = await prisma.documentation.create({
    data: payload,
  })
  return result
}

const getAllDocumentationsForAdmin = async (
  query: any
): Promise<any> => {
  const { search, category, sortBy, sortOrder } = query
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const skip = (page - 1) * limit

  const andConditions: Prisma.DocumentationWhereInput[] = []

  if (search) {
    andConditions.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { titleBn: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  if (category) {
    andConditions.push({
      category: {
        equals: category,
      },
    })
  }

  const whereConditions: Prisma.DocumentationWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {}

  const sortConditions: { [key: string]: Prisma.SortOrder } = {}
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder as Prisma.SortOrder
  } else {
    sortConditions['createdAt'] = 'desc'
  }

  const result = await prisma.documentation.findMany({
    where: whereConditions,
    skip,
    take: limit,
    orderBy: sortConditions,
  })

  const total = await prisma.documentation.count({
    where: whereConditions,
  })

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: result
  }
}

const getAllDocumentationsForVendor = async (): Promise<Documentation[]> => {
  const result = await prisma.documentation.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: 'desc' },
  })
  return result
}

const getSingleDocumentation = async (title: string): Promise<Documentation | null> => {
  const result = await prisma.documentation.findFirst({
    where: { title },
  })
  return result
}

const updateDocumentation = async (
  id: string,
  payload: UpdateDocumentationDto
): Promise<Documentation> => {
  const result = await prisma.documentation.update({
    where: { id },
    data:payload,
  })
  return result
}

const deleteDocumentation = async (id: string): Promise<Documentation> => {
  const result = await prisma.documentation.delete({
    where: { id },
  })
  return result
}

export const DocumentationService = {
  createDocumentation,
  getAllDocumentationsForAdmin,
  getAllDocumentationsForVendor,
  getSingleDocumentation,
  updateDocumentation,
  deleteDocumentation,
}
