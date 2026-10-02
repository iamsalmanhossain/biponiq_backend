import ejs from 'ejs'
import path from 'path'

export const renderTemplate = async (templateName: string, data: Record<string, any>) => {
  const filePath = path.join(process.cwd(), 'templates', 'email', `${templateName}.ejs`)

  return await ejs.renderFile(filePath, data)
}
