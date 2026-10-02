/**
 * Stable machine-readable error codes for the subscription checkout flow.
 *
 * These values are part of the public API contract for
 * POST /api/v1/subscriptions/checkout and its supporting domain / registrant checks.
 *
 * Rules:
 *  - Never remove or rename a code once it has been shipped.
 *  - New codes must be added here before being referenced in service files.
 *  - Do not duplicate these string literals throughout service files.
 */

export const CHECKOUT_ERROR_CODES = {
  // ── Draft ────────────────────────────────────────────────────────────────
  CHECKOUT_DRAFT_EXPIRED: 'CHECKOUT_DRAFT_EXPIRED',
  CHECKOUT_COUPON_INVALID: 'CHECKOUT_COUPON_INVALID',

  // ── Managed-domain feature availability ──────────────────────────────────
  DOMAIN_PURCHASE_DISABLED: 'DOMAIN_PURCHASE_DISABLED',

  // ── Domain registrant contact ────────────────────────────────────────────
  DOMAIN_CONTACT_MISSING: 'DOMAIN_CONTACT_MISSING',
  DOMAIN_CONTACT_UNCONFIRMED: 'DOMAIN_CONTACT_UNCONFIRMED',

  // ── Domain ownership conflicts ───────────────────────────────────────────
  DOMAIN_ALREADY_PURCHASED: 'DOMAIN_ALREADY_PURCHASED',
  MANUAL_DOMAIN_ALREADY_CONNECTED: 'MANUAL_DOMAIN_ALREADY_CONNECTED',

  // ── Domain quote / availability ──────────────────────────────────────────
  DOMAIN_QUOTE_EXPIRED: 'DOMAIN_QUOTE_EXPIRED',
  DOMAIN_UNAVAILABLE: 'DOMAIN_UNAVAILABLE',
  DOMAIN_QUOTE_CHANGED: 'DOMAIN_QUOTE_CHANGED',

  // ── Subscription plan ────────────────────────────────────────────────────
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  PLAN_INACTIVE: 'PLAN_INACTIVE',
  BILLING_OPTION_UNAVAILABLE: 'BILLING_OPTION_UNAVAILABLE',
  ALREADY_SUBSCRIBED: 'ALREADY_SUBSCRIBED',

  // ── Payment gateway ──────────────────────────────────────────────────────
  PAYMENT_GATEWAY_UNAVAILABLE: 'PAYMENT_GATEWAY_UNAVAILABLE',
  PAYMENT_METHOD_NOT_ALLOWED_BY_VENDOR: 'PAYMENT_METHOD_NOT_ALLOWED_BY_VENDOR',
} as const

export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[keyof typeof CHECKOUT_ERROR_CODES]
