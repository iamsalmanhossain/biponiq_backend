import multer from 'multer'

// Allowed Mime Types
const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

// Multer Memory Storage
const storage = multer.memoryStorage()

// File Filter
const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true)
    return
  }

  cb(new Error('Only jpeg, jpg, png, webp images are allowed'))
}

// Multer Upload Instance
const upload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 2 * 1024 * 1024,
  },
})

export default upload
