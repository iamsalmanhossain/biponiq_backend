// ======================================================
// MOCK PRODUCT SERVICE
// Temporary implementation — replace with real product
// service integration when available.
// ======================================================

export class MockProductService {
  /**
   * Returns the available stock for a given product.
   * Currently mocked to always return 100.
   */
  static async getStock(_productId: string): Promise<number> {
    return 100;
  }
}
