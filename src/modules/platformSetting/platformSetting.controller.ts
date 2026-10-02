import { Request, Response } from 'express'
import httpStatus from 'http-status'

import catchAsync from '../../shared/utils/catchAsync.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import { PlatformSettingService } from './platformSetting.service.js'

const getSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformSettingService.getSettings()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform settings retrieved successfully',
    data: result,
  })
})

const updateSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformSettingService.updateSettings(req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform settings updated successfully',
    data: result,
  })
})

const getPublicStats = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformSettingService.getPublicStats()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Public stats retrieved successfully',
    data: result,
  })
})

const updateFraudCheckerApiKey = catchAsync(async (req: Request, res: Response) => {
  const { bdCourierApiKey } = req.body

  const result = await PlatformSettingService.updateFraudCheckerApiKey(bdCourierApiKey)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fraud Checker API Key updated successfully',
    data: result,
  })
})

const getPlatformSettingsWithAlert = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformSettingService.getPlatformSettingsWithAlert()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform settings with alert retrieved successfully',
    data: result,
  })
})

export const PlatformSettingController = {
  getSettings,
  updateSettings,
  getPublicStats,
  updateFraudCheckerApiKey,
  getPlatformSettingsWithAlert,
}
