export const TransactionType = {
  ORDER: 'ORDER',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType]
