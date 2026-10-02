export enum BackupStatus {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export const BACKUP_FOLDER = 'database-backups'
export const BACKUP_FILE_EXTENSION = '.dump'
export const DEFAULT_RETENTION_DAYS = 30
export const DEFAULT_BACKUP_CRON = '0 2 * * *' // runs every day at 2:00 AM
export const MAX_BACKUP_HISTORY = 100
export const BACKUP_CONTENT_TYPE = 'application/octet-stream'
