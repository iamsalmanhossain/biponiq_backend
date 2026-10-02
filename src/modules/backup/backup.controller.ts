import { Request, Response } from 'express'
import status from 'http-status'

import catchAsync from '../../shared/utils/catchAsync.js'
import { sendResponse } from '../../shared/utils/sendResponse.js'
import { BackupService } from './backup.service.js'

/**
 * Create Database Backup
 */
const createBackup = catchAsync(async (_req: Request, res: Response) => {
    const result = await BackupService.createBackup()

    sendResponse(res, {
        statusCode: status.CREATED,
        success: true,
        message: 'Database backup created successfully.',
        data: result,
    })
})

/**
 * Restore Database Backup
 */
const restoreBackup = catchAsync(async (req: Request, res: Response) => {
    const { backupKey } = req.body

    const result = await BackupService.restoreBackup(backupKey)

    sendResponse(res, {
        statusCode: status.OK,
        success: true,
        message: 'Database restored successfully.',
        data: result,
    })
})

/**
 * Get Backup History
 */
const getBackupHistory = catchAsync(async (_req: Request, res: Response) => {
    const result = await BackupService.getBackupHistory()

    sendResponse(res, {
        statusCode: status.OK,
        success: true,
        message: 'Backup history retrieved successfully.',
        data: result,
    })
})

/**
 * Download Database Backup File
 */
const downloadBackup = catchAsync(async (req: Request, res: Response) => {
    const backupKey = (req.body?.backupKey || req.query?.backupKey) as string

    const { stream, fileName } = await BackupService.downloadBackup(backupKey)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

    stream.pipe(res)
})


/**
 * Restore Database Backup from Uploaded .dump File
 */
const restoreFromUploadedFile = catchAsync(async (req: Request, res: Response) => {
    const result = await BackupService.restoreFromUploadedFile(req.file)

    sendResponse(res, {
        statusCode: status.OK,
        success: true,
        message: 'Database restored successfully from uploaded .dump file.',
        data: result,
    })
})

export const BackupController = {
    createBackup,
    restoreBackup,
    restoreFromUploadedFile,
    getBackupHistory,
    downloadBackup,
}