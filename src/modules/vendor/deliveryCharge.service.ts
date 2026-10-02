import type { Prisma } from '@prisma/client'

type DeliveryChargeValues = {
  insideCharge: number
  outsideCharge: number
}

export const upsertVendorDeliveryCharge = async (
  tx: Prisma.TransactionClient,
  vendorId: string,
  { insideCharge, outsideCharge }: DeliveryChargeValues
) => {
  return tx.deliveryCharge.upsert({
    where: {
      vendorId,
    },
    update: {
      insideCharge,
      outsideCharge,
    },
    create: {
      vendorId,
      insideCharge,
      outsideCharge,
    },
    select: {
      id: true,
      insideCharge: true,
      outsideCharge: true,
    },
  })
}
