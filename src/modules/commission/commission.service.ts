const calculateCommission = (totalAmount: number, commissionRate: number) => {
  const commissionAmount = (totalAmount * commissionRate) / 100

  const vendorAmount = totalAmount - commissionAmount

  return {
    totalAmount,
    commissionRate,
    commissionAmount,
    vendorAmount,
  }
}

export const CommissionService = {
  calculateCommission,
}
