import { prisma } from '../../lib/prisma.js'
import redis from '../../config/redis.config.js'

export const LocationService = {
  async getAllDivisions() {
    const cacheKey = 'locations:divisions'
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const divisions = await prisma.division.findMany({
      orderBy: { name: 'asc' },
    })

    await redis.set(cacheKey, JSON.stringify(divisions), 'EX', 2592000) // 30 days
    return divisions
  },

  async getDistricts(divisionId?: string) {
    const cacheKey = divisionId ? `locations:districts:${divisionId}` : 'locations:districts:all'
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const districts = await prisma.district.findMany({
      where: divisionId ? { divisionId } : {},
      orderBy: { name: 'asc' },
    })

    await redis.set(cacheKey, JSON.stringify(districts), 'EX', 2592000) // 30 days
    return districts
  },
}
