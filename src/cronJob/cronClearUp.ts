export const cleanupSoftDeletedRecords = async (
  model: any,
  seconds: number,
  extraWhere: Record<string, unknown> = {}
) => {
  const expiryDate = new Date()

  expiryDate.setSeconds(expiryDate.getSeconds() - seconds)

  const result = await model.deleteMany({
    where: {
      isDeleted: true,
      deletedAt: {
        lt: expiryDate,
      },
      ...extraWhere,
    },
  })

  return result
}
