import fs from 'fs'
import path from 'path'

export const ensureDirectoryExists = (directory: string) => {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true })
    }
}

export const generateBackupFileName = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    return `backup-${year}-${month}-${day}_${hour}-${minute}-${second}.dump`
}

export const getR2BackupKey = (fileName: string) => {
    return `database-backups/${fileName}`
}

export const getFileSize = async (filePath: string) => {
    const stat = await fs.promises.stat(filePath)
    return stat.size
}

export const deleteLocalFile = async (filePath: string) => {
    if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
    }
}

export const fileExists = (filePath: string) => {
    return fs.existsSync(filePath)
}

export const resolveBackupPath = (backupDirectory: string, fileName: string) => {
    return path.join(backupDirectory, fileName)
}

export const calculateDuration = (startTime: Date, endTime: Date) => {
    return endTime.getTime() - startTime.getTime()
}

export const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}