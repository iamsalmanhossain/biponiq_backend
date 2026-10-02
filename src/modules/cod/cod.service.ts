const createCODOrder = async (payload: any) => {
  const orderData = {
    ...payload,
    status: 'COD_PENDING',
  }

  return orderData
}

const updateOrderStatus = async (id: string, status: string) => {
  return {
    id,
    status,
  }
}

export const CodService = {
  createCODOrder,
  updateOrderStatus,
}
