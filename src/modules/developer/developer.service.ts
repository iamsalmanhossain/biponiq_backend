import httpStatus from 'http-status'
import { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma.js'
import AppError from '../../shared/errors/AppError.js'
import { deleteImageHandler } from '../upload/uploadHandler.js'
import type {
  CreateDeveloperPagePayload,
  UpdateDeveloperPagePayload,
  CreateDeveloperPayload,
  UpdateDeveloperPayload,
  AdminDeveloperQuery,
} from './developer.types.js'

type DeveloperImageUpload = Pick<
  Awaited<ReturnType<typeof import('../upload/uploadHandler.js').uploadSingleImage>>,
  'imageUrl' |
  'imageKey'
>

const developerPageAdminSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      developers: true,
    },
  },
} satisfies Prisma.DeveloperPageSelect

type DeveloperPageAdminRow = Prisma.DeveloperPageGetPayload<{
  select: typeof developerPageAdminSelect
}>

const mapPage = (page: DeveloperPageAdminRow) => ({
  id: page.id,
  title: page.title,
  slug: page.slug,
  description: page.description,
  displayOrder: page.displayOrder,
  developerCount: page._count.developers,
  createdAt: page.createdAt,
  updatedAt: page.updatedAt,
})

const createDeveloperPage = async (payload: CreateDeveloperPagePayload) => {
  const duplicate = await prisma.developerPage.findUnique({
    where: { slug: payload.slug },
    select: { id: true },
  })

  if (duplicate) {
    throw new AppError(httpStatus.CONFLICT, 'A developer page with this slug already exists')
  }

  const page = await prisma.developerPage.create({
    data: {
      title: payload.title,
      slug: payload.slug,
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.displayOrder !== undefined && { displayOrder: payload.displayOrder }),
    },
    select: developerPageAdminSelect,
  })

  return mapPage(page)
}

const getDeveloperPagesForAdmin = async () => {
  const pages = await prisma.developerPage.findMany({
    select: developerPageAdminSelect,
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return pages.map(mapPage)
}

const getDeveloperPageById = async (pageId: string) => {
  const page = await prisma.developerPage.findUnique({
    where: { id: pageId },
    select: developerPageAdminSelect,
  })

  if (!page) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer page not found')
  }

  return mapPage(page)
}

const updateDeveloperPage = async (pageId: string, payload: UpdateDeveloperPagePayload) => {
  const existing = await prisma.developerPage.findUnique({
    where: { id: pageId },
    select: { id: true, slug: true },
  })

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer page not found')
  }

  if (payload.slug !== undefined && payload.slug !== existing.slug) {
    const duplicate = await prisma.developerPage.findUnique({
      where: { slug: payload.slug },
      select: { id: true },
    })

    if (duplicate) {
      throw new AppError(httpStatus.CONFLICT, 'A developer page with this slug already exists')
    }
  }

  const page = await prisma.developerPage.update({
    where: { id: pageId },
    data: {
      ...(payload.title !== undefined && { title: payload.title }),
      ...(payload.slug !== undefined && { slug: payload.slug }),
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.displayOrder !== undefined && { displayOrder: payload.displayOrder }),
    },
    select: developerPageAdminSelect,
  })

  return mapPage(page)
}

const deleteDeveloperPage = async (pageId: string) => {
  const page = await prisma.developerPage.findUnique({
    where: { id: pageId },
    select: { id: true, _count: { select: { developers: true } } },
  })

  if (!page) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer page not found')
  }

  if (page._count.developers > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Move or remove developers before deleting this page'
    )
  }

  await prisma.developerPage.delete({ where: { id: pageId } })

  return { id: pageId }
}

const developerAdminSelect = {
  id: true,
  name: true,
  role: true,
  image: true,
  bio: true,
  githubUrl: true,
  linkedinUrl: true,
  displayOrder: true,
  pageId: true,
  createdAt: true,
  updatedAt: true,
  page: {
    select: {
      id: true,
      title: true,
      slug: true,
      displayOrder: true,
    },
  },
} satisfies Prisma.DeveloperSelect

const createDeveloper = async (payload: CreateDeveloperPayload) => {
  const page = await prisma.developerPage.findUnique({
    where: { id: payload.pageId },
    select: { id: true },
  })

  if (!page) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer page not found')
  }

  return prisma.developer.create({
    data: {
      name: payload.name,
      role: payload.role,
      pageId: payload.pageId,
      ...(payload.bio !== undefined && { bio: payload.bio }),
      ...(payload.githubUrl !== undefined && { githubUrl: payload.githubUrl }),
      ...(payload.linkedinUrl !== undefined && { linkedinUrl: payload.linkedinUrl }),
      ...(payload.displayOrder !== undefined && { displayOrder: payload.displayOrder }),
    },
    select: developerAdminSelect,
  })
}

const getDevelopersForAdmin = async (query: AdminDeveloperQuery) => {
  return prisma.developer.findMany({
    where: {
      ...(query.pageId && { pageId: query.pageId }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' },
      }),
    },
    select: developerAdminSelect,
    orderBy: [
      { page: { displayOrder: 'asc' } },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })
}

const getDeveloperById = async (developerId: string) => {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    select: developerAdminSelect,
  })

  if (!developer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer not found')
  }

  return developer
}

const updateDeveloper = async (developerId: string, payload: UpdateDeveloperPayload) => {
  const existing = await prisma.developer.findUnique({
    where: { id: developerId },
    select: { id: true, pageId: true },
  })

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer not found')
  }

  if (payload.pageId !== undefined && payload.pageId !== existing.pageId) {
    const targetPage = await prisma.developerPage.findUnique({
      where: { id: payload.pageId },
      select: { id: true },
    })

    if (!targetPage) {
      throw new AppError(httpStatus.NOT_FOUND, 'Developer page not found')
    }
  }

  return prisma.developer.update({
    where: { id: developerId },
    data: {
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.role !== undefined && { role: payload.role }),
      ...(payload.pageId !== undefined && { pageId: payload.pageId }),
      ...(payload.bio !== undefined && { bio: payload.bio }),
      ...(payload.githubUrl !== undefined && { githubUrl: payload.githubUrl }),
      ...(payload.linkedinUrl !== undefined && { linkedinUrl: payload.linkedinUrl }),
      ...(payload.displayOrder !== undefined && { displayOrder: payload.displayOrder }),
    },
    select: developerAdminSelect,
  })
}

const deleteDeveloper = async (developerId: string) => {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    select: { id: true, imageKey: true },
  })

  if (!developer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer not found')
  }

  await prisma.developer.delete({ where: { id: developerId } })

  if (developer.imageKey) {
    try {
      await deleteImageHandler(developer.imageKey)
    } catch (error) {
      console.error('Failed to delete developer image from storage:', error)
    }
  }

  return { id: developerId }
}

const updateDeveloperImage = async (
  developerId: string,
  uploadedImage: DeveloperImageUpload
) => {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    select: { id: true, imageKey: true },
  })

  if (!developer) {
    try {
      await deleteImageHandler(uploadedImage.imageKey)
    } catch (cleanupError) {
      console.error('Failed to cleanup newly uploaded image after developer not found:', cleanupError)
    }
    throw new AppError(httpStatus.NOT_FOUND, 'Developer not found')
  }

  let updatedDeveloper
  try {
    updatedDeveloper = await prisma.developer.update({
      where: { id: developerId },
      data: {
        image: uploadedImage.imageUrl,
        imageKey: uploadedImage.imageKey,
      },
      select: developerAdminSelect,
    })
  } catch (error) {
    try {
      await deleteImageHandler(uploadedImage.imageKey)
    } catch (cleanupError) {
      console.error('Failed to cleanup newly uploaded image after DB update failure:', cleanupError)
    }
    throw error
  }

  if (developer.imageKey && developer.imageKey !== uploadedImage.imageKey) {
    try {
      await deleteImageHandler(developer.imageKey)
    } catch (error) {
      console.error('Failed to delete old developer image from storage:', error)
    }
  }

  return updatedDeveloper
}

const removeDeveloperImage = async (developerId: string) => {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    select: { id: true, image: true, imageKey: true },
  })

  if (!developer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer not found')
  }

  if (!developer.image && !developer.imageKey) {
    return prisma.developer.findUnique({
      where: { id: developerId },
      select: developerAdminSelect,
    })
  }

  const updatedDeveloper = await prisma.developer.update({
    where: { id: developerId },
    data: {
      image: null,
      imageKey: null,
    },
    select: developerAdminSelect,
  })

  if (developer.imageKey) {
    try {
      await deleteImageHandler(developer.imageKey)
    } catch (error) {
      console.error('Failed to delete old developer image from storage:', error)
    }
  }

  return updatedDeveloper
}

const publicDeveloperSelect = {
  name: true,
  role: true,
  image: true,
  bio: true,
  githubUrl: true,
  linkedinUrl: true,
} satisfies Prisma.DeveloperSelect

const getAllDevelopers = async () => {
  return prisma.developer.findMany({
    select: {
      ...publicDeveloperSelect,
      page: {
        select: {
          title: true,
          slug: true,
          description: true,
        },
      },
    },
    orderBy: [
      { page: { displayOrder: 'asc' } },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })
}

const getDevelopersByPageSlug = async (slug: string) => {
  const page = await prisma.developerPage.findUnique({
    where: { slug },
    select: {
      title: true,
      slug: true,
      description: true,
      developers: {
        select: publicDeveloperSelect,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!page) {
    throw new AppError(httpStatus.NOT_FOUND, 'Developer page not found')
  }

  const { developers, ...pageData } = page

  return {
    page: pageData,
    developers,
  }
}

const getPublicDeveloperPages = async () => {
  return prisma.developerPage.findMany({
    select: {
      title: true,
      slug: true,
      description: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

export const DeveloperService = {
  createDeveloperPage,
  getDeveloperPagesForAdmin,
  getDeveloperPageById,
  updateDeveloperPage,
  deleteDeveloperPage,
  createDeveloper,
  getDevelopersForAdmin,
  getDeveloperById,
  updateDeveloper,
  deleteDeveloper,
  updateDeveloperImage,
  removeDeveloperImage,
  getAllDevelopers,
  getDevelopersByPageSlug,
  getPublicDeveloperPages,
}
