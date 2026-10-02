import { CouponDiscountType } from '@prisma/client'

type CalculateDiscountArgs = {
  amount: number
  discountType: CouponDiscountType
  discountValue: number
  maxDiscountAmount?: number | null
}

export const normalizeCouponCode = (code: string) => {
  return code.trim().toUpperCase()
}

export const calculateDiscountAmount = ({
  amount,
  discountType,
  discountValue,
  maxDiscountAmount,
}: CalculateDiscountArgs) => {
  let discountAmount =
    discountType === CouponDiscountType.PERCENTAGE ? (amount * discountValue) / 100 : discountValue

  if (maxDiscountAmount && discountAmount > maxDiscountAmount) {
    discountAmount = maxDiscountAmount
  }

  if (discountAmount > amount) {
    discountAmount = amount
  }

  return discountAmount
}
