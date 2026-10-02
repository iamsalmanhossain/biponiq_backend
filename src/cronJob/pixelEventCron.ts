import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'
import redis from '../config/redis.config.js'

export const initPixelEventCron = () => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const pipeline = redis.pipeline()
      pipeline.lrange('pixel_events_queue', 0, -1)
      pipeline.del('pixel_events_queue')
      pipeline.lrange('tiktok_pixel_events_queue', 0, -1)
      pipeline.del('tiktok_pixel_events_queue')
      
      const results = await pipeline.exec()
      if (!results) return

      // 1. Process Meta / Facebook Pixel Events
      const eventsStr = results?.[0]?.[1] as string[]
      if (eventsStr && eventsStr.length > 0) {
        const data = eventsStr.map((e) => JSON.parse(e))
        const vendorIds = [
          ...new Set(data.map((e: any) => e.vendorId).filter(Boolean)),
        ]
        const existingVendors = await prisma.vendor.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true },
        })
        const validVendorIds = new Set(existingVendors.map((v) => v.id))
        const validData = data.filter((e: any) =>
          validVendorIds.has(e.vendorId)
        )

        if (validData.length > 0) {
          await prisma.pixelEvent.createMany({
            data: validData,
          })
          console.log(`[Cron] Bulk inserted ${validData.length} Meta pixel events`)
        }
      }

      // 2. Process TikTok Pixel Events
      const tiktokEventsStr = results?.[2]?.[1] as string[]
      if (tiktokEventsStr && tiktokEventsStr.length > 0) {
        const data = tiktokEventsStr.map((e) => JSON.parse(e))
        const vendorIds = [
          ...new Set(data.map((e: any) => e.vendorId).filter(Boolean)),
        ]
        const existingVendors = await prisma.vendor.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true },
        })
        const validVendorIds = new Set(existingVendors.map((v) => v.id))
        const validData = data.filter((e: any) =>
          validVendorIds.has(e.vendorId)
        )

        if (validData.length > 0) {
          await prisma.tiktokPixelEvent.createMany({
            data: validData,
          })
          console.log(
            `[Cron] Bulk inserted ${validData.length} TikTok pixel events`
          )
        }
      }
    } catch (error) {
      console.error('[Cron Job Error] Failed to insert pixel events:', error)
    }
  })
}
