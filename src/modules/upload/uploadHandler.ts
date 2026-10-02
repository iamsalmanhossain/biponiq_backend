import path from 'path'
import { randomUUID } from 'crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../../config/env.js'
import { r2Client } from '../../config/cloudflare.r2.js'
import { ImageType } from '../../services/storage/image.types.js'
import { optimizeImage } from '../../services/storage/ImageOptimizer.js'
import { validateImage } from '../../services/storage/ImageValidator.js'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

type ImageFolder = 'products' | 'avatar' | 'shop_logo' | 'admin' | 'malicious'

export async function uploadSingleImage(
  file: Express.Multer.File,
  folder: ImageFolder,
  type: ImageType
) {
  // Validate image
  await validateImage(file)

  // Compress & optimize
  const optimized = await optimizeImage(file, type)

  // Clean filename
  const originalName = path
    .parse(file.originalname)
    .name.replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()

  // Generate unique key
  const key = `biponiq/${folder}/${originalName}-${randomUUID()}.${optimized.extension}`

  // Upload to Cloudflare R2
  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: optimized.buffer,
      ContentType: optimized.mimeType,
    })
  )

  return {
    imageName: `${originalName}.${optimized.extension}`,
    imageKey: key,
    imageUrl: `${env.R2_PUBLIC_URL}/${key}`,

    width: optimized.width,
    height: optimized.height,
    size: optimized.size,
    mimeType: optimized.mimeType,
  }
}

export async function deleteImageHandler(imageKey: string) {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: imageKey,
    })
  )
}
