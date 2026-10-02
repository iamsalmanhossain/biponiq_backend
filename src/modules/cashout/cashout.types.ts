import { CashoutMethod } from '@prisma/client'

export type CreateCashoutPayload = {
  amount: number
  method: CashoutMethod
  accountHolderName: string
  accountNumber: string
}