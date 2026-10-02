import sharp from 'sharp'
import { ImageType } from './image.types.js'

interface OptimizedImage {
  buffer: Buffer
  width: number
  height: number
  size: number
  mimeType: string
  extension: string
}

export async function optimizeImage(
  file: Express.Multer.File,
  type: ImageType
): Promise<OptimizedImage> {
  let width = 1600
  let quality = 75

  switch (type) {
    case ImageType.PRODUCT:
      width = 1600
      quality = 75
      break

    case ImageType.AVATAR:
      width = 300
      quality = 70
      break

    case ImageType.SHOP_LOGO:
      width = 500
      quality = 80
      break

    case ImageType.MALICIOUS:
      width = 1600
      quality = 75
      break
  }

  const { data, info } = await sharp(file.buffer)
    .rotate()
    .resize({
      width,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality,
      effort: 6,
    })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    size: info.size,
    mimeType: 'image/webp',
    extension: 'webp',
  }
}
