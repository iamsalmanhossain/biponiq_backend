import redis from '../../config/redis.config.js'
import { prisma } from '../../lib/prisma.js'

const invalidateTemplateCache = async () => {
  
  await redis.del('templates:active')
}

const getAllTemplates = async () => {
  return await prisma.template.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

const getActiveTemplates = async () => {
  
  const cachedTemplates = await redis.get('templates:active')
  if (cachedTemplates) {
    return JSON.parse(cachedTemplates)
  }

  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  await redis.set('templates:active', JSON.stringify(templates), 'EX', 86400) // Cache for 24 hours
  return templates
}

const upsertTemplate = async (templateId: string, payload: { name: string; isActive?: boolean; tags?: string[] }) => {
  const result = await prisma.template.upsert({
    where: { templateId },
    update: {
      name: payload.name,
      ...(payload.isActive !== undefined && { isActive: payload.isActive }),
      ...(payload.tags !== undefined && { tags: payload.tags }),
    },
    create: {
      templateId,
      name: payload.name,
      isActive: payload.isActive ?? true,
      tags: payload.tags ?? [],
    },
  })
  
  await invalidateTemplateCache()
  return result
}

const updateTemplateStatus = async (id: string, isActive: boolean) => {
  const result = await prisma.template.update({
    where: { id },
    data: { isActive },
  })
  await invalidateTemplateCache()
  return result
}

const updateTemplateTags = async (id: string, tags: string[]) => {
  const result = await prisma.template.update({
    where: { id },
    data: { tags },
  })
  await invalidateTemplateCache()
  return result
}

export const TemplateService = {
  getAllTemplates,
  getActiveTemplates,
  upsertTemplate,
  updateTemplateStatus,
  updateTemplateTags,
}
