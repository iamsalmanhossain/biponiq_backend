import fs from 'fs'
import YAML from 'yaml'

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// const filePath = path.join(__dirname, 'swagger.yml')
// const file = fs.readFileSync(filePath, 'utf8')

// const swaggerPath = path.resolve(process.cwd(), '../../swagger.yml')

const swaggerPath = path.resolve(__dirname, '../../swagger.yml')

const file = fs.readFileSync(swaggerPath, 'utf8')

const swaggerDocument = YAML.parse(file)

export default swaggerDocument
