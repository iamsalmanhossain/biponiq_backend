import sharp from 'sharp'

export async function validateImage(file: Express.Multer.File) {
  try {
    const metadata = await sharp(file.buffer).metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image.')
    }
  } catch {
    throw new Error('Invalid or corrupted image file.')
  }
}
