import { z } from 'zod'

import { normalizeDeveloperPageSlug } from './developer.helper.js'

export const DEVELOPER_BIO_MAX_LENGTH = 180

// Checked after normalisation so casing/whitespace tricks are blocked.
const RESERVED_SLUGS = new Set([
  'all',
  'admin',
  'api',
  'login',
  'register',
  'dashboard',
  'developers',
])

const isReservedSlug = (slug: string) => RESERVED_SLUGS.has(slug)


const titleField = z.string().trim().min(1, 'Title is required')

const slugField = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .transform(normalizeDeveloperPageSlug)
  .refine((slug) => slug.length > 0, { message: 'Slug cannot be empty after normalization' })
  .refine((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), {
    message: 'Slug must be lowercase kebab-case',
  })
  .refine((slug) => !isReservedSlug(slug), {
    message: 'This slug is reserved and cannot be used',
  })

const displayOrderField = z
  .number()
  .int('Display order must be an integer')
  .min(0, 'Display order must be zero or greater')

const nonNegativeDisplayOrder = displayOrderField.optional()

const optionalTrimmedString = z.string().trim().optional()

const bioField = z
  .string()
  .trim()
  .max(DEVELOPER_BIO_MAX_LENGTH, 'Bio must be 180 characters or less.')

const githubUrlField = z
  .string()
  .url('GitHub URL must be a valid URL')
  .refine((url) => url.startsWith('https://'), { message: 'GitHub URL must use HTTPS' })
  .refine(
    (url) => {
      try {
        return new URL(url).hostname === 'github.com'
      } catch {
        return false
      }
    },
    { message: 'GitHub URL must be on github.com' }
  )

const linkedinUrlField = z
  .string()
  .url('LinkedIn URL must be a valid URL')
  .refine((url) => url.startsWith('https://'), { message: 'LinkedIn URL must use HTTPS' })
  .refine(
    (url) => {
      try {
        const { hostname } = new URL(url)
        return hostname === 'linkedin.com' || hostname === 'www.linkedin.com'
      } catch {
        return false
      }
    },
    { message: 'LinkedIn URL must be on linkedin.com' }
  )


const createPageSchema = z
  .object({
    title: titleField,
    slug: slugField,
    description: optionalTrimmedString,
    displayOrder: nonNegativeDisplayOrder,
  })
  .strict()

const updatePageSchema = z
  .object({
    title: titleField.optional(),
    slug: slugField.optional(),
    description: z.string().trim().nullable().optional(),
    displayOrder: nonNegativeDisplayOrder,
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.slug !== undefined ||
      data.description !== undefined ||
      data.displayOrder !== undefined,
    { message: 'At least one field must be provided to update' }
  )


const createDeveloperSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    role: z.string().trim().min(1, 'Role is required'),
    pageId: z.string().uuid('pageId must be a valid UUID'),
    bio: bioField.optional(),
    githubUrl: githubUrlField.optional(),
    linkedinUrl: linkedinUrlField.optional(),
    displayOrder: nonNegativeDisplayOrder,
  })
  .strict()

const updateDeveloperSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').optional(),
    role: z.string().trim().min(1, 'Role is required').optional(),
    pageId: z.string().uuid('pageId must be a valid UUID').optional(),
    bio: bioField.nullable().optional(),
    githubUrl: githubUrlField.nullable().optional(),
    linkedinUrl: linkedinUrlField.nullable().optional(),
    displayOrder: nonNegativeDisplayOrder,
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.role !== undefined ||
      data.pageId !== undefined ||
      data.bio !== undefined ||
      data.githubUrl !== undefined ||
      data.linkedinUrl !== undefined ||
      data.displayOrder !== undefined,
    { message: 'At least one field must be provided to update' }
  )


const pageIdParamSchema = z
  .object({
    pageId: z.string().uuid('pageId must be a valid UUID'),
  })
  .strict()

// "all" is the system route for the public all-developers view, not a stored page slug.
const pageSlugParamSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .transform(normalizeDeveloperPageSlug)
      .refine((slug) => slug.length > 0, { message: 'Slug cannot be empty' })
      .refine((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), {
        message: 'Slug must be lowercase kebab-case',
      })
      .refine((slug) => !isReservedSlug(slug), {
        message: 'This slug is reserved and cannot be used',
      }),
  })
  .strict()

const developerIdParamSchema = z
  .object({
    developerId: z.string().uuid('developerId must be a valid UUID'),
  })
  .strict()

const adminDeveloperQuerySchema = z
  .object({
    pageId: z.string().uuid('pageId must be a valid UUID').optional(),
    search: z.string().trim().min(1, 'Search cannot be empty').optional(),
  })
  .strict()


export type CreateDeveloperPagePayload = z.infer<typeof createPageSchema>
export type UpdateDeveloperPagePayload = z.infer<typeof updatePageSchema>
export type CreateDeveloperPayload = z.infer<typeof createDeveloperSchema>
export type UpdateDeveloperPayload = z.infer<typeof updateDeveloperSchema>
export type AdminDeveloperQuery = z.infer<typeof adminDeveloperQuerySchema>

export const DeveloperValidation = {
  createPageSchema,
  updatePageSchema,
  pageIdParamSchema,
  pageSlugParamSchema,
  developerIdParamSchema,
  adminDeveloperQuerySchema,
  createDeveloperSchema,
  updateDeveloperSchema,
}
