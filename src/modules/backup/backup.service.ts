import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import pg from 'pg'

import { r2Client } from '../../config/cloudflare.r2.js'
import { env } from '../../config/env.js'
import status from 'http-status'
import AppError from '../../shared/errors/AppError.js'
import { Upload } from '@aws-sdk/lib-storage'
import { prisma } from '../../lib/prisma.js'
import { UserRole, AdminAccountStatus } from '@prisma/client'
import { sendBackupFailureEmail } from '../../shared/utils/email.service.js'
import { BackupLog as PrismaBackupLog } from '@prisma/client'

import {
    ListObjectsV2Command,
    DeleteObjectCommand,
    GetObjectCommand,
} from '@aws-sdk/client-s3'

import {
    BackupResult,
    BackupFile,
    BackupHistory,
} from './backup.interface.js'

import {
    BackupStatus,
    BACKUP_CONTENT_TYPE,
    BACKUP_FOLDER,
    DEFAULT_RETENTION_DAYS,
} from './backup.constant.js'

import {
    ensureDirectoryExists,
    generateBackupFileName,
    resolveBackupPath,
    calculateDuration,
    formatBytes,
} from './backup.utils.js'


// ─── Metadata helpers ────────────────────────────────────────────────────────

/** Query PostgreSQL for its version string and the current database name. */
const getDbMetadata = async (): Promise<{ postgresVersion: string; database: string }> => {
    const requiresSsl = env.DATABASE_URL?.includes('sslmode=require') || env.DATABASE_URL?.includes('sslmode=verify')
    let client = new pg.Client({
        connectionString: env.DATABASE_URL,
        ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
        connectionTimeoutMillis: 10000,
    })

    try {
        await client.connect()
    } catch (err: any) {
        if (err.message?.includes('server does not support SSL')) {
            client = new pg.Client({
                connectionString: env.DATABASE_URL,
                connectionTimeoutMillis: 10000,
            })
            await client.connect()
        } else {
            throw err
        }
    }

    try {
        const result = await client.query<{ version: string; db: string }>(
            'SELECT version() AS version, current_database() AS db'
        )
        const versionStr = result.rows[0]?.version ?? ''
        const pgVersion = versionStr.match(/PostgreSQL (\d+\.\d+)/)?.[1] ?? 'unknown'
        const database = result.rows[0]?.db ?? 'unknown'
        return { postgresVersion: pgVersion, database }
    } finally {
        await client.end().catch(() => {})
    }
}

/** Read the application version from package.json. */
const getAppVersion = async (): Promise<string> => {
    try {
        const pkgPath = path.join(process.cwd(), 'package.json')
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { version?: string }
        return pkg.version ?? '0.0.0'
    } catch {
        return '0.0.0'
    }
}

/** Build the metadata object attached to every backup. */
const buildBackupMetadata = async (size: number, createdAt: Date) => {
    const [{ postgresVersion, database }, applicationVersion] = await Promise.all([
        getDbMetadata(),
        getAppVersion(),
    ])
    return {
        postgresVersion,
        database,
        createdAt: createdAt.toISOString(),
        backupType: 'pg_dump -Fc',
        applicationVersion,
        size,
    }
}


// ─── pg_dump ─────────────────────────────────────────────────────────────────

/**
 * Runs `pg_dump --format=custom --compress=0` to produce a binary .dump file.
 * No SQL parsing, no compression step — PostgreSQL does it natively.
 */
const runPgDump = (outputFilePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        console.log('⚙️  [pg_dump] Running: pg_dump --format=custom --compress=0 ...')

        const args = [
            '--format=custom',
            '--compress=0',
            '--no-password',
            `--dbname=${env.DATABASE_URL}`,
            `--file=${outputFilePath}`,
        ]

        const proc = spawn(env.PG_DUMP_PATH, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        })

        let stderr = ''
        proc.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString()
        })

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('✅ [pg_dump] Dump completed successfully.')
                resolve()
            } else {
                reject(
                    new AppError(
                        status.INTERNAL_SERVER_ERROR,
                        `pg_dump exited with code ${code}.\n${stderr || '(no stderr output)'}`
                    )
                )
            }
        })

        proc.on('error', (err) => {
            reject(
                new AppError(
                    status.INTERNAL_SERVER_ERROR,
                    `pg_dump binary not found or failed to start: ${err.message}\n` +
                    `Ensure pg_dump is installed and available in PATH.`
                )
            )
        })
    })
}


// ─── pg_restore ──────────────────────────────────────────────────────────────

/**
 * Runs `pg_restore --clean --if-exists --exit-on-error` on a .dump file.
 * Returns a warnings string (stderr output) for logging; rejects on fatal errors.
 */
const runPgRestore = (dumpFilePath: string): Promise<{ warnings: string }> => {
    return new Promise((resolve, reject) => {
        console.log('⚙️  [pg_restore] Running: pg_restore --clean --if-exists --exit-on-error ...')

        const args = [
            '--clean',
            '--if-exists',
            '--exit-on-error',
            '--no-password',
            `--dbname=${env.DATABASE_URL}`,
            dumpFilePath,
        ]

        const proc = spawn(env.PG_RESTORE_PATH, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        })

        let stderr = ''
        proc.stderr?.on('data', (chunk: Buffer) => {
            const line = chunk.toString()
            stderr += line
            // Stream warnings to console in real time
            if (line.trim()) console.log(`  [pg_restore] ${line.trim()}`)
        })

        proc.on('close', (code) => {
            // 0 = clean success
            // 1 = completed with non-fatal warnings (e.g. objects not found during --clean)
            if (code === 0 || code === 1) {
                console.log(`✅ [pg_restore] Completed (exit code ${code}).`)
                resolve({ warnings: stderr })
            } else {
                reject(
                    new AppError(
                        status.INTERNAL_SERVER_ERROR,
                        `pg_restore failed with exit code ${code}.\n${stderr || '(no stderr output)'}`
                    )
                )
            }
        })

        proc.on('error', (err) => {
            reject(
                new AppError(
                    status.INTERNAL_SERVER_ERROR,
                    `pg_restore binary not found or failed to start: ${err.message}\n` +
                    `Ensure pg_restore is installed and available in PATH.`
                )
            )
        })
    })
}


// ─── R2 storage helpers ───────────────────────────────────────────────────────

const uploadBackupToR2 = async (
    localFilePath: string,
    fileName: string,
    metadata: Record<string, string>
): Promise<BackupFile> => {
    const stat = await fs.stat(localFilePath)
    const fileStream = fsSync.createReadStream(localFilePath)
    const r2Key = `${BACKUP_FOLDER}/${fileName}`
    const now = new Date()

    console.log(
        `☁️  [R2 Upload] Uploading ${fileName} (${formatBytes(stat.size)}) ` +
        `to bucket "${env.R2_BUCKET_NAME}" at key "${r2Key}"...`
    )

    const upload = new Upload({
        client: r2Client,
        params: {
            Bucket: env.R2_BUCKET_NAME,
            Key: r2Key,
            Body: fileStream,
            ContentType: BACKUP_CONTENT_TYPE,
            Metadata: metadata,
        },
    })

    upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && progress.total) {
            const pct = ((progress.loaded / progress.total) * 100).toFixed(1)
            console.log(
                `  ☁️  Progress: ${pct}% (${formatBytes(progress.loaded)} / ${formatBytes(progress.total)})`
            )
        }
    })

    await upload.done()
    console.log(`✅ [R2 Upload] Uploaded successfully to "${r2Key}".`)

    return { fileName, localPath: localFilePath, r2Key, size: stat.size, compressed: false, createdAt: now }
}

const cleanupLocalFiles = async (...filePaths: string[]): Promise<void> => {
    await Promise.all(
        filePaths.map(async (p) => {
            try {
                await fs.unlink(p)
                console.log(`🧹 Removed temporary file: ${p}`)
            } catch (err: any) {
                if (err.code !== 'ENOENT') console.warn(`⚠️ Could not remove ${p}: ${err.message}`)
            }
        })
    )
}

const deleteOldBackups = async (): Promise<void> => {
    console.log(`🔎 [Retention] Checking R2 folder "${BACKUP_FOLDER}" for expired backups...`)
    const response = await r2Client.send(
        new ListObjectsV2Command({ Bucket: env.R2_BUCKET_NAME, Prefix: BACKUP_FOLDER })
    )

    if (!response.Contents?.length) {
        console.log('ℹ️  [Retention] No backup files found in R2.')
        return
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - DEFAULT_RETENTION_DAYS)
    console.log(`🔎 [Retention] Cutoff date: ${cutoff.toISOString()}`)

    const expired = response.Contents.filter((obj) => obj.LastModified && obj.LastModified < cutoff)

    if (expired.length > 0) {
        console.log(`🗑️  [Retention] Deleting ${expired.length} expired backup(s)...`)
        await Promise.all(
            expired.map((obj) =>
                r2Client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: obj.Key! }))
            )
        )
        console.log('✅ [Retention] Expired backups deleted.')
    } else {
        console.log('ℹ️  [Retention] No expired backups found.')
    }

    // Clean DB logs older than 90 days
    try {
        const dbCutoff = new Date()
        dbCutoff.setDate(dbCutoff.getDate() - 90)
        const deleted = await prisma.backupLog.deleteMany({ where: { createdAt: { lt: dbCutoff } } })
        console.log(`✅ [Retention] Deleted ${deleted.count} old backup log record(s) from database.`)
    } catch (dbErr) {
        console.error('❌ [Retention] Failed to delete old backup logs:', dbErr)
    }
}


// ─── Public service functions ─────────────────────────────────────────────────

/**
 * Creates a pg_dump -Fc backup, uploads it to R2, and logs to the database.
 * No SQL parsing. No gzip compression step. PostgreSQL native binary format.
 */
const createBackup = async (): Promise<BackupResult> => {
    console.log('\n===========================================================')
    console.log('🚀 [Backup Service] Starting pg_dump -Fc backup...')
    console.log('===========================================================')
    const startTime = new Date()

    const backupDirectory = path.join(process.cwd(), 'backups')
    ensureDirectoryExists(backupDirectory)

    const dumpFileName = generateBackupFileName()            // backup-YYYY-MM-DD_HH-mm-SS.dump
    const dumpFilePath = resolveBackupPath(backupDirectory, dumpFileName)

    let backupStatus = BackupStatus.SUCCESS
    let message = 'Database backup completed successfully.'
    let uploadedFile: BackupFile | null = null

    try {
        // Step 1: pg_dump
        console.log('\n-----------------------------------------------------------')
        console.log('▶️  [Step 1/4] Running pg_dump -Fc (custom format, no compression)...')
        console.log('-----------------------------------------------------------')
        await runPgDump(dumpFilePath)
        console.log('✅ [Step 1/4] pg_dump completed.')

        // Step 2: Build metadata
        console.log('\n-----------------------------------------------------------')
        console.log('▶️  [Step 2/4] Building backup metadata...')
        console.log('-----------------------------------------------------------')
        const fileStat = await fs.stat(dumpFilePath)
        const meta = await buildBackupMetadata(fileStat.size, startTime)
        console.log(`📋 Backup metadata: ${JSON.stringify(meta, null, 2)}`)

        // R2 metadata must be string values
        const r2Metadata: Record<string, string> = {
            postgresVersion: meta.postgresVersion,
            database: meta.database,
            createdAt: meta.createdAt,
            backupType: meta.backupType,
            applicationVersion: meta.applicationVersion,
            size: String(meta.size),
        }

        // Step 3: Upload .dump to R2
        console.log('\n-----------------------------------------------------------')
        console.log('▶️  [Step 3/4] Uploading .dump file to Cloudflare R2...')
        console.log('-----------------------------------------------------------')
        uploadedFile = await uploadBackupToR2(dumpFilePath, dumpFileName, r2Metadata)
        console.log('✅ [Step 3/4] R2 upload completed.')

        // Step 4: Cleanup + retention
        console.log('\n-----------------------------------------------------------')
        console.log('▶️  [Step 4/4] Cleanup & retention policy...')
        console.log('-----------------------------------------------------------')
        await cleanupLocalFiles(dumpFilePath)
        try {
            await deleteOldBackups()
        } catch (retentionErr) {
            console.error('❌ Retention policy error (non-fatal):', retentionErr)
        }
        console.log('✅ [Step 4/4] Done.')

        const endTime = new Date()
        const duration = calculateDuration(startTime, endTime)

        console.log('\n===========================================================')
        console.log(`🎉 [Backup Service] Backup completed in ${duration}ms!`)
        console.log(`📦 File: ${dumpFileName}`)
        console.log(`📊 Size: ${formatBytes(uploadedFile.size)}`)
        console.log(`🔑 R2 Key: ${uploadedFile.r2Key}`)
        console.log('===========================================================\n')

        return {
            success: true,
            status: BackupStatus.SUCCESS,
            message,
            fileName: uploadedFile.fileName,
            localPath: uploadedFile.localPath,
            r2Key: uploadedFile.r2Key,
            uploaded: true,
            deletedLocalFile: true,
            size: uploadedFile.size,
            duration,
            createdAt: endTime,
        }
    } catch (error: any) {
        backupStatus = BackupStatus.FAILED
        message = error.message || 'Backup failed.'
        console.error('\n===========================================================')
        console.error(`💥 [Backup Service] Backup failed: ${message}`)
        console.error('===========================================================\n')

        await cleanupLocalFiles(dumpFilePath)

        try {
            const admins = await prisma.user.findMany({
                where: {
                    role: UserRole.ADMIN,
                    isDeleted: false,
                    admin: { adminAccountStatus: AdminAccountStatus.ACTIVE },
                },
                select: { email: true, name: true },
            })
            await Promise.all(admins.map((a) => sendBackupFailureEmail(a.email, a.name, message)))
        } catch (emailErr) {
            console.error('❌ Failed to send failure notification emails:', emailErr)
        }

        throw error
    } finally {
        try {
            await prisma.backupLog.create({
                data: {
                    status: backupStatus,
                    fileName: uploadedFile?.fileName ?? dumpFileName,
                    r2Key: uploadedFile?.r2Key ?? '',
                    size: uploadedFile?.size ?? 0,
                    duration: calculateDuration(startTime, new Date()),
                    message,
                },
            })
        } catch (dbErr) {
            console.error('❌ Failed to write backup log to database:', dbErr)
        }
    }
}


/**
 * Downloads a .dump file from R2 and restores it via pg_restore.
 * No SQL parsing. No statement counting. No retries.
 */
const restoreBackup = async (backupKey: string): Promise<void> => {
    console.log('\n===========================================================')
    console.log('🔄 [Restore Service] Starting pg_restore from R2...')
    console.log(`🔑 Target: ${backupKey}`)
    console.log('===========================================================')
    const startTime = new Date()

    // Step 1: Download .dump from R2
    console.log('\n-----------------------------------------------------------')
    console.log('▶️  [Step 1/3] Downloading .dump file from Cloudflare R2...')
    console.log('-----------------------------------------------------------')

    let r2Response
    try {
        r2Response = await r2Client.send(
            new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: backupKey })
        )
    } catch (err: any) {
        if (err.name === 'NoSuchKey') throw new AppError(status.NOT_FOUND, 'Backup file not found in R2.')
        throw new AppError(status.INTERNAL_SERVER_ERROR, `Failed to fetch from R2: ${err.message}`)
    }

    if (!r2Response.Body) throw new AppError(status.NOT_FOUND, 'Backup file body is empty.')

    const backupDirectory = path.join(process.cwd(), 'backups')
    ensureDirectoryExists(backupDirectory)

    const dumpFileName = path.basename(backupKey)
    const dumpFilePath = path.join(backupDirectory, dumpFileName)

    // Stream directly to disk (no decompression needed — pg_dump -Fc is not gzip)
    const { pipeline } = await import('stream/promises')
    await pipeline(r2Response.Body as NodeJS.ReadableStream, fsSync.createWriteStream(dumpFilePath))

    const fileStat = await fs.stat(dumpFilePath)
    console.log(`✅ [Step 1/3] Downloaded ${formatBytes(fileStat.size)} → ${dumpFilePath}`)

    // Step 2: pg_restore
    console.log('\n-----------------------------------------------------------')
    console.log('▶️  [Step 2/3] Running pg_restore...')
    console.log('-----------------------------------------------------------')
    try {
        const { warnings } = await runPgRestore(dumpFilePath)
        if (warnings.trim()) {
            console.log('⚠️  pg_restore warnings (non-fatal):')
            warnings.split('\n').filter(Boolean).forEach((w) => console.log(`   ${w}`))
        }
    } finally {
        // Step 3: Cleanup
        console.log('\n-----------------------------------------------------------')
        console.log('▶️  [Step 3/3] Cleaning up temporary files...')
        console.log('-----------------------------------------------------------')
        await cleanupLocalFiles(dumpFilePath)
    }

    const duration = calculateDuration(startTime, new Date())
    console.log('\n===========================================================')
    console.log(`🎉 [Restore Service] Restore completed in ${duration}ms!`)
    console.log('===========================================================\n')
}


/**
 * Accepts an uploaded .dump file and restores it via pg_restore.
 * No SQL parsing. No statement counting. No normalization. No retries.
 */
const restoreFromUploadedFile = async (file?: Express.Multer.File) => {
    if (!file || !file.path) {
        throw new AppError(status.BAD_REQUEST, 'Please upload a .dump file.')
    }

    const originalName = (file.originalname ?? '').toLowerCase()
    if (!originalName.endsWith('.dump')) {
        await fs.unlink(file.path).catch(() => {})
        throw new AppError(
            status.BAD_REQUEST,
            `Invalid file type: "${file.originalname}". Only .dump files (pg_dump -Fc format) are accepted.`
        )
    }

    console.log('\n===========================================================')
    console.log(`🔄 [Restore Service] Restoring from uploaded file: ${file.originalname}`)
    console.log('===========================================================')
    const startTime = new Date()

    try {
        const { warnings } = await runPgRestore(file.path)
        if (warnings.trim()) {
            console.log('⚠️  pg_restore warnings (non-fatal):')
            warnings.split('\n').filter(Boolean).forEach((w) => console.log(`   ${w}`))
        }

        const duration = calculateDuration(startTime, new Date())
        console.log('\n===========================================================')
        console.log(`🎉 [Restore Service] Restore completed in ${duration}ms!`)
        console.log('===========================================================\n')

        return {
            success: true,
            message: 'Database restored successfully from uploaded .dump file.',
            duration,
            restoredAt: new Date(),
        }
    } finally {
        await fs.unlink(file.path).catch(() => {})
        console.log(`🧹 Cleaned up uploaded temporary file: ${file.path}`)
    }
}


// ─── History & Download ───────────────────────────────────────────────────────

const getBackupHistory = async (): Promise<BackupHistory[]> => {
    const logs = await prisma.backupLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
    })
    return logs.map((log: PrismaBackupLog) => ({
        status: log.status as BackupStatus,
        fileName: log.fileName ?? '',
        r2Key: log.r2Key ?? '',
        size: log.size ?? 0,
        createdAt: log.createdAt,
    }))
}

const downloadBackup = async (backupKey: string) => {
    if (!backupKey) throw new AppError(status.BAD_REQUEST, 'Backup key is required.')

    try {
        const response = await r2Client.send(
            new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: backupKey })
        )
        if (!response.Body) throw new AppError(status.NOT_FOUND, 'Backup file not found in storage.')

        const fileName = path.basename(backupKey)
        const contentType = response.ContentType ?? BACKUP_CONTENT_TYPE

        return { stream: response.Body as NodeJS.ReadableStream, fileName, contentType }
    } catch (error: any) {
        if (error instanceof AppError) throw error
        if (error.name === 'NoSuchKey') throw new AppError(status.NOT_FOUND, 'Backup file not found in R2.')
        throw new AppError(status.INTERNAL_SERVER_ERROR, `Failed to download backup: ${error.message}`)
    }
}


// ─── Exports ──────────────────────────────────────────────────────────────────

export const BackupService = {
    createBackup,
    restoreBackup,
    restoreFromUploadedFile,
    getBackupHistory,
    downloadBackup,
}
