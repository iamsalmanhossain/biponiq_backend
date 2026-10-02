import { z } from 'zod'

const createDocumentationSchema = z.object({

  title: z.string().min(1, { message: 'Title is required' }),
  titleBn: z.string().optional(),
  category: z.string().min(1, { message: 'Category is required' }),
  descriptionSteps: z.array(z.string().min(1, { message: 'Step cannot be empty' })).min(1, { message: 'At least one step is required' }),
  descriptionStepsBn: z.array(z.string().min(1, { message: 'Step cannot be empty' })).optional(),
  isPublished: z.boolean().optional(),
  images: z.array(z.string()).optional(),
  redirectUrl: z.string().optional(),

})

const updateDocumentationSchema = z.object({

  title: z.string().optional(),
  titleBn: z.string().optional(),
  category: z.string().optional(),
  descriptionSteps: z.array(z.string().min(1, { message: 'Step cannot be empty' })).optional(),
  descriptionStepsBn: z.array(z.string().min(1, { message: 'Step cannot be empty' })).optional(),
  isPublished: z.boolean().optional(),
  images: z.array(z.string()).optional(),
  redirectUrl: z.string().optional(),

})

export const DocumentationValidation = {
  createDocumentationSchema,
  updateDocumentationSchema,
}
