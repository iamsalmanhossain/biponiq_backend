import { UserRole } from '@prisma/client'
import express, { Router } from 'express'
import path from 'path'
import multer from 'multer'
import status from 'http-status'
import AppError from '../../shared/errors/AppError.js'
import { authenticate } from '../../middleware/authinticate.js'
import { authorizeRole } from '../../middleware/rbac.middleware.js'
import { BackupController } from './backup.controller.js'
import { ensureDirectoryExists } from './backup.utils.js'

const router: Router = express.Router()

// Multer Storage Configuration for Dump Uploads
const tempDir = path.join(process.cwd(), 'backups', 'temp-uploads')
ensureDirectoryExists(tempDir)

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, tempDir)
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
        cb(null, `${uniqueSuffix}-${file.originalname}`)
    },
})

// Multer .dump File Upload Instance — only pg_dump -Fc custom-format dumps accepted
const uploadDump = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        const originalName = (file.originalname || '').toLowerCase()

        if (!originalName.endsWith('.dump')) {
            return cb(
                new AppError(
                    status.BAD_REQUEST,
                    `Only .dump files (pg_dump -Fc format) are accepted. Received: "${file.originalname}"`
                )
            )
        }

        cb(null, true)
    },
})

// Create backup manually
router.post(
    '/create',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    BackupController.createBackup
)

// Restore database from Cloudflare R2
router.post(
    '/restore',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    BackupController.restoreBackup
)

// Restore database from uploaded .dump file
router.post(
    '/restore-upload',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    uploadDump.single('file'),
    BackupController.restoreFromUploadedFile
)

router.post(
    '/restore/upload',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    uploadDump.single('file'),
    BackupController.restoreFromUploadedFile
)

router.post(
    '/upload-restore',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    uploadDump.single('file'),
    BackupController.restoreFromUploadedFile
)

// Backup history
router.get(
    '/history',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    BackupController.getBackupHistory
)

// Download backup file
router.post(
    '/download',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    BackupController.downloadBackup
)

router.get(
    '/download',
    authenticate,
    authorizeRole(UserRole.ADMIN),
    BackupController.downloadBackup
)

export const BackupRoutes = router


