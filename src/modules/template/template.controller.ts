import type { Request, Response } from 'express'
import { TemplateService } from './template.service.js'
import catchAsync from '../../shared/utils/catchAsync.js'

const getAllTemplates = catchAsync(async (req: Request, res: Response) => {
  const result = await TemplateService.getAllTemplates()
  res.status(200).json({
    success: true,
    message: 'Templates retrieved successfully',
    data: result,
  })
})

const getActiveTemplates = catchAsync(async (req: Request, res: Response) => {
  const result = await TemplateService.getActiveTemplates()
  res.status(200).json({
    success: true,
    message: 'Active templates retrieved successfully',
    data: result,
  })
})

const upsertTemplate = catchAsync(async (req: Request, res: Response) => {
  const { templateId } = req.params as { templateId: string }
  const result = await TemplateService.upsertTemplate(templateId, req.body)
  res.status(200).json({
    success: true,
    message: 'Template upserted successfully',
    data: result,
  })
})

const updateTemplateStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { isActive } = req.body
  const result = await TemplateService.updateTemplateStatus(id, isActive)
  res.status(200).json({
    success: true,
    message: 'Template status updated successfully',
    data: result,
  })
})

const updateTemplateTags = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { tags } = req.body
  const result = await TemplateService.updateTemplateTags(id, tags)
  res.status(200).json({
    success: true,
    message: 'Template tags updated successfully',
    data: result,
  })
})

export const TemplateController = {
  getAllTemplates,
  getActiveTemplates,
  upsertTemplate,
  updateTemplateStatus,
  updateTemplateTags,
}
