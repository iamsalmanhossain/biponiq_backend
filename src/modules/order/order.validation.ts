import { z } from "zod";

// ============================================================
// CUSTOMER INFO
// ============================================================
export const CustomerInfoSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .min(2, "Name must be at least 2 characters"),

  phone: z
    .string({ error: "Phone number is required" })
    .min(7, "Phone number must be at least 7 characters"),

  email: z
    .string({ error: "Email is required" })
    .email("Invalid email address"),

  area: z
    .string({ error: "Area is required" })
    .min(3, "Area must be at least 3 characters"),

  districtName: z
    .string({ error: "District is required" })
    .min(2, "District name must be at least 2 characters"),

  divisionName: z
    .string({ error: "Division is required" })
    .min(2, "Division name must be at least 2 characters"),
});

// ============================================================
// ORDER ITEM — Which product, how much
// ============================================================
export const OrderItemSchema = z.object({
  productId: z
    .string({ error: "Product ID is required" })
    .uuid("Product ID must be a valid UUID"),

  quantity: z
    .number({ error: "Quantity is required" })
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1"),
});

// ============================================================
// LOGGED-IN USER ORDER — token order
// ============================================================
export const PlaceOrderSchema = z.object({
  items: z
    .array(OrderItemSchema)
    .min(1, "At least one item is required"),

  customerInfo: CustomerInfoSchema,
  paymentMethod: z.enum(["COD", "SSLCOMMERZ", "EPS"], { error: "Payment method is required" }),
  couponCode: z.string().optional(),
});

// ============================================================
// GUEST ORDER — login without order
// ============================================================
export const GuestOrderSchema = z.object({
  items: z
    .array(OrderItemSchema)
    .min(1, "At least one item is required"),

  customerInfo: CustomerInfoSchema,
  paymentMethod: z.enum(["COD", "SSLCOMMERZ", "EPS"], { error: "Payment method is required" }),
  couponCode: z.string().optional(),
});

// ============================================================
// APPLY COUPON
// ============================================================
export const ApplyCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  items: z.array(OrderItemSchema).min(1, "At least one item is required"),
});

// ============================================================
// STATUS UPDATE — PENDING, CONFIRMED, SHIPPED ...
// ============================================================
const ORDER_STATUS_VALUES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
  "REFUNDED",
  "FAILED",
] as const;

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES, {
    error: "Invalid order status",
  }),
});

// ============================================================
// PAGINATION — page=1&limit=10
// ============================================================
export const OrderPaginationSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (typeof val === 'number') return val
      return val ? parseInt(val, 10) : 1
    })
    .pipe(z.number().int().min(1, 'Page must be at least 1')),

  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (typeof val === 'number') return val
      return val ? parseInt(val, 10) : 10
    })
    .pipe(z.number().int().min(1).max(100, 'Limit cannot exceed 100')),
})

// ============================================================
// TYPES — TypeScript use for
// ============================================================
export type PlaceOrderInput        = z.infer<typeof PlaceOrderSchema>;
export type GuestOrderInput        = z.infer<typeof GuestOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
export type OrderPaginationInput   = z.infer<typeof OrderPaginationSchema>;
export type ApplyCouponInput       = z.infer<typeof ApplyCouponSchema>;
