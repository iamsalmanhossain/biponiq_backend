import { Prisma } from '@prisma/client'

export const publicSubscriptionPlanSelect = {
  id: true,
  name: true,
  nameBn: true,
  type: true,
  displayOrder: true,
  isMostPopular: true,
  visitorLimit: true,
  description: true,
  descriptionBn: true,
} satisfies Prisma.SubscriptionPlanSelect

export const subscriptionPlanPriceSelect = {
  id: true,
  billingCycle: true,
  price: true,
  discountPercent: true,
  durationDays: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionPlanPriceSelect

export const subscriptionPlanPricePublicSelect = {
  id: true,
  billingCycle: true,
  price: true,
  discountPercent: true,
  durationDays: true,
} satisfies Prisma.SubscriptionPlanPriceSelect

export const subscriptionPaymentSelect = {
  id: true,
  amount: true,
  billingCycle: true,
  transactionId: true,
  paymentMethod: true,
  paymentStatus: true,
  purpose: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionPaymentSelect

export const checkoutDraftPaymentSelect = {
  id: true,
  planId: true,
  billingCycle: true,
  couponCode: true,

  selectedDomain: true,
  selectedExtension: true,
  domainRegistrationYears: true,

  domainBaseRegistrationPriceUsd: true,
  domainIcannFeeUsd: true,
  domainProviderPriceUsd: true,
  domainExchangeRate: true,
  domainMarkupPercent: true,
  domainRegistrationPriceBdt: true,

  domainQuotedAt: true,
  domainQuoteExpiresAt: true,
} satisfies Prisma.VendorCheckoutDraftSelect

export const pendingCheckoutPaymentSelect = {
  id: true,
  transactionId: true,

  amount: true,
  originalAmount: true,
  discountAmount: true,
  finalAmount: true,
  couponId: true,

  paymentMethod: true,

  isInstallmentIncluded: true,

  isDomainIncluded: true,
  domain: true,
  domainExtension: true,
  domainRegistrationYears: true,

  domainBaseRegistrationPriceUsd: true,
  domainIcannFeeUsd: true,
  domainProviderPriceUsd: true,
  domainExchangeRate: true,
  domainMarkupPercent: true,
  domainRegistrationPriceBdt: true,

  domainQuotedAt: true,
  domainQuoteExpiresAt: true,
  domainRegistrantSnapshot: true,
} satisfies Prisma.SubscriptionPaymentSelect
