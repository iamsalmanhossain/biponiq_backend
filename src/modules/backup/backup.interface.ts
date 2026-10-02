import { BackupStatus } from './backup.constant.js'

export interface BackupFile {
    fileName: string
    localPath: string
    r2Key: string

    size: number
    compressed: boolean

    createdAt: Date
}

export interface BackupResult {
    success: boolean
    status: BackupStatus

    message: string

    fileName: string
    localPath: string
    r2Key: string

    uploaded: boolean
    deletedLocalFile: boolean

    size: number
    duration: number

    createdAt: Date
}

export interface BackupConfig {
    dbHost: string
    dbPort: number
    dbName: string
    dbUser: string
    dbPassword: string

    backupFolder: string
    retentionDays: number

    bucketName: string
    r2Folder: string
}

export interface BackupLog {
    status: BackupStatus

    startTime: Date
    endTime: Date
    duration: number

    fileName: string
    r2Key: string

    size: number

    message: string
}


export interface BackupHistory {
    status: BackupStatus

    fileName: string
    r2Key: string

    size: number
    createdAt: Date
}

export interface BackupScheduleConfig {
    cron: string
    enabled: boolean
}

export interface RestoreBackupOptions {
    filePath: string
    overwriteExisting: boolean
}