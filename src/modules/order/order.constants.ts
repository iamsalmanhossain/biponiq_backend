import { OrderStatus } from "@prisma/client";

// ============================================================
// ORDER STATUS TRANSITION MAP
//
// Allowed flow:
//   PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED
//   PENDING, CONFIRMED, PROCESSING → CANCELLED
// ============================================================
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]:    [OrderStatus.CONFIRMED,  OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]:  [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED,    OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]:    [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]:  [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]:  [],
  [OrderStatus.CANCELLED]:  [],
  [OrderStatus.RETURNED]:   [],
  [OrderStatus.REFUNDED]:   [],
  [OrderStatus.FAILED]:     [],
};

// Statuses from which cancellation is allowed
export const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PROCESSING,
];

// Pagination defaults
export const ORDER_DEFAULT_PAGE      = 1;
export const ORDER_DEFAULT_PAGE_SIZE = 10;
export const ORDER_MAX_PAGE_SIZE     = 1000;
