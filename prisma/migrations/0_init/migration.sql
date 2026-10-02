-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "VendorAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdminAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('SSLCOMMERZ', 'EPS', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentResultType" AS ENUM ('ORDER', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "CashoutMethod" AS ENUM ('BKASH', 'NAGAD', 'ROCKET');

-- CreateEnum
CREATE TYPE "CashoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VENDOR', 'ADMIN', 'AFFILIATE');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "SubscriptionPlanType" AS ENUM ('FREE_TRIAL', 'INSTALLMENT', 'STANDARD', 'MEDIUM', 'PREMIUM', 'NO_PLAN');

-- CreateEnum
CREATE TYPE "SubscriptionBillingCycle" AS ENUM ('MONTHLY', 'SIX_MONTHS', 'YEARLY');

-- CreateEnum
CREATE TYPE "VendorSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentPurpose" AS ENUM ('SUBSCRIPTION_PLAN', 'INSTALLMENT_FEE', 'VISITOR_LIMIT_TOPUP');

-- CreateEnum
CREATE TYPE "EarningType" AS ENUM ('ORDER_REVENUE', 'COMMISSION_DEDUCTION', 'REFUND_DEDUCTION', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'CONFIGURING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StoreDomainType" AS ENUM ('SUBDOMAIN', 'CUSTOM_DOMAIN');

-- CreateEnum
CREATE TYPE "PurchasedDomainStatus" AS ENUM ('PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'REGISTRATION_PENDING', 'REGISTERING', 'REGISTERED', 'DNS_CONFIGURING', 'READY_TO_ACTIVATE', 'ACTIVE', 'REGISTRATION_FAILED', 'DNS_FAILED');

-- CreateEnum
CREATE TYPE "CourierProvider" AS ENUM ('STEADFAST', 'PATHAO', 'REDX', 'COURIER_BD', 'CARRYBEE', 'PAPERFLY');

-- CreateEnum
CREATE TYPE "ImageCategory" AS ENUM ('PRODUCT', 'MALICIOUS');

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "area" TEXT NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatar" TEXT,
    "adminAccountStatus" "AdminAccountStatus" NOT NULL DEFAULT 'PENDING',
    "avatarKey" TEXT,
    "pixelId" TEXT,
    "pixelAccessToken" TEXT,
    "pixelTestCode" TEXT,
    "tiktokPixelId" TEXT,
    "tiktokAccessToken" TEXT,
    "tiktokTestCode" TEXT,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPixelEvent" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPixelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminVisitorTracking" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminVisitorTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payouts" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "methodType" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatewayResponse" TEXT,
    "gatewayTransactionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payout_methods" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "gatewayAccountId" TEXT,
    "gatewayToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupLog" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fileName" TEXT,
    "r2Key" TEXT,
    "size" INTEGER,
    "duration" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashout_settings" (
    "id" TEXT NOT NULL,
    "chargeRate" DECIMAL(5,2) NOT NULL,
    "minimumCashoutAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allowedMethods" TEXT[] DEFAULT ARRAY['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER']::TEXT[],

    CONSTRAINT "cashout_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isSeen" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "maxDiscountAmount" DOUBLE PRECISION,
    "minimumAmount" DOUBLE PRECISION,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "affiliateId" TEXT,
    "affiliateCommissionType" "CouponDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "affiliateCommissionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_applicable_plans" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_applicable_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "subscriptionPaymentId" TEXT NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCourier" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "provider" "CourierProvider" NOT NULL,
    "credentials" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCourier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierOrder" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT,
    "provider" "CourierProvider" NOT NULL,
    "consignmentId" TEXT,
    "trackingCode" TEXT,
    "status" TEXT,
    "invoice" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "codAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rawResponse" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "txtVerificationToken" TEXT,
    "cloudflareId" TEXT,
    "cloudflareStatus" TEXT,
    "cloudflareWwwId" TEXT,
    "cloudflareWwwStatus" TEXT,
    "verificationRecords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCharge" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "insideCharge" INTEGER NOT NULL DEFAULT 60,
    "outsideCharge" INTEGER NOT NULL DEFAULT 120,

    CONSTRAINT "DeliveryCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_pages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developer_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "image" TEXT,
    "imageKey" TEXT,
    "bio" TEXT,
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "pageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "category" TEXT NOT NULL,
    "descriptionSteps" TEXT[],
    "descriptionStepsBn" TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "images" TEXT[],
    "redirectUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpersonationLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_earnings" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGenerationLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "guestCustomerId" TEXT NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "addressId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "vendorCouponId" TEXT,
    "affiliateEarning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vendorEarning" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayData" JSONB,
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_result_tokens" (
    "id" TEXT NOT NULL,
    "transactionType" "PaymentResultType" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_result_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixelEvent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "url" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PixelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enableCod" BOOLEAN NOT NULL DEFAULT true,
    "enableSsl" BOOLEAN NOT NULL DEFAULT true,
    "enableEps" BOOLEAN NOT NULL DEFAULT true,
    "enableMfs" BOOLEAN NOT NULL DEFAULT true,
    "enableFraudChecker" BOOLEAN NOT NULL DEFAULT true,
    "enableCoupons" BOOLEAN NOT NULL DEFAULT true,
    "enableDeliverySupport" BOOLEAN NOT NULL DEFAULT true,
    "enableManagedDomainPurchase" BOOLEAN NOT NULL DEFAULT true,
    "adminBdCourierApiKey" TEXT,
    "adminBdCourierApiLimit" INTEGER DEFAULT 0,
    "adminBdCourierApiUsed" INTEGER DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchased_domains" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "registrationYears" INTEGER NOT NULL DEFAULT 1,
    "registrationAmount" DOUBLE PRECISION NOT NULL,
    "subscriptionPaymentId" TEXT NOT NULL,
    "customDomainId" TEXT,
    "status" "PurchasedDomainStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
    "registrationIdempotencyKey" TEXT NOT NULL,
    "registrarOrderId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "registrationAttempts" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3),
    "registrationExpiresAt" TIMESTAMP(3),
    "dnsConfiguredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchased_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "type" "SubscriptionPlanType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isMostPopular" BOOLEAN NOT NULL DEFAULT false,
    "visitorLimit" INTEGER,
    "description" TEXT,
    "descriptionBn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_prices" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "SubscriptionBillingCycle" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_subscriptions" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "VendorSubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visitorLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingCycle" "SubscriptionBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "assignedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "customDays" INTEGER,

    CONSTRAINT "vendor_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "transactionId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'SSLCOMMERZ',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" "SubscriptionPaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION_PLAN',
    "note" TEXT,
    "billingCycle" "SubscriptionBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "couponId" TEXT,
    "originalAmount" DOUBLE PRECISION,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalAmount" DOUBLE PRECISION,
    "affiliateEarning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isInstallmentIncluded" BOOLEAN NOT NULL DEFAULT false,
    "isDomainIncluded" BOOLEAN NOT NULL DEFAULT false,
    "domain" TEXT,
    "domainExtension" TEXT,
    "domainRegistrationYears" INTEGER,
    "domainBaseRegistrationPriceUsd" DOUBLE PRECISION,
    "domainIcannFeeUsd" DOUBLE PRECISION,
    "domainProviderPriceUsd" DOUBLE PRECISION,
    "domainExchangeRate" DOUBLE PRECISION,
    "domainMarkupPercent" DOUBLE PRECISION,
    "domainRegistrationPriceBdt" DOUBLE PRECISION,
    "domainRegistrantSnapshot" JSONB,
    "domainQuotedAt" TIMESTAMP(3),
    "domainQuoteExpiresAt" TIMESTAMP(3),
    "gatewayData" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "visitorLimitPackageId" TEXT,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_checkout_drafts" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "SubscriptionBillingCycle" NOT NULL,
    "couponCode" TEXT,
    "selectedDomain" TEXT,
    "selectedExtension" TEXT,
    "domainRegistrationYears" INTEGER,
    "domainBaseRegistrationPriceUsd" DOUBLE PRECISION,
    "domainIcannFeeUsd" DOUBLE PRECISION,
    "domainProviderPriceUsd" DOUBLE PRECISION,
    "domainExchangeRate" DOUBLE PRECISION,
    "domainMarkupPercent" DOUBLE PRECISION,
    "domainRegistrationPriceBdt" DOUBLE PRECISION,
    "domainQuotedAt" TIMESTAMP(3),
    "domainQuoteExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_checkout_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TiktokPixelEvent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "url" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TiktokPixelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageName" TEXT,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "height" INTEGER NOT NULL DEFAULT 0,
    "imageCategory" "ImageCategory" NOT NULL DEFAULT 'PRODUCT',
    "imageKey" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "mimeType" TEXT NOT NULL DEFAULT 'unknown',
    "size" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatar" TEXT,
    "imageKey" TEXT,
    "provider" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "vendorCode" TEXT,
    "avatar" TEXT,
    "shopName" TEXT NOT NULL,
    "shopLogo" TEXT,
    "subDomain" TEXT NOT NULL,
    "activeDomainType" "StoreDomainType",
    "accountStatus" "VendorAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subscriptionPlanType" "SubscriptionPlanType" NOT NULL DEFAULT 'FREE_TRIAL',
    "avatarKey" TEXT,
    "bdCourierApiKey" TEXT,
    "draftConfig" JSONB,
    "isOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "pageConfig" JSONB,
    "pixelAccessToken" TEXT,
    "pixelId" TEXT,
    "pixelTestCode" TEXT,
    "tiktokPixelId" TEXT,
    "tiktokAccessToken" TEXT,
    "tiktokTestCode" TEXT,
    "shopLogoKey" TEXT,
    "socialLinks" JSONB,
    "adminFraudCheckUsageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_cashouts" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "chargeRate" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "chargeAmount" DECIMAL(12,2) NOT NULL,
    "payoutAmount" DECIMAL(12,2) NOT NULL,
    "method" "CashoutMethod" NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "status" "CashoutStatus" NOT NULL DEFAULT 'PENDING',
    "adminTransactionId" TEXT,
    "failureReason" TEXT,
    "rejectionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalDeduction" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "vendor_cashouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "affiliateId" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "maxDiscountAmount" DOUBLE PRECISION,
    "minimumAmount" DOUBLE PRECISION,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "affiliateCommissionType" "CouponDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "affiliateCommissionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_domain_registrants" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "organizationName" TEXT,
    "address1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_domain_registrants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorEarning" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "VendorEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_limit_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visitorLimit" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_limit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorTracking" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TemplateToVendorCoupon" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TemplateToVendorCoupon_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_userId_key" ON "Admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_email_key" ON "affiliates"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_vendorId_key" ON "ChatConversation"("vendorId");

-- CreateIndex
CREATE INDEX "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_isSeen_idx" ON "ChatMessage"("conversationId", "isSeen");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_isActive_idx" ON "coupons"("isActive");

-- CreateIndex
CREATE INDEX "coupons_startsAt_idx" ON "coupons"("startsAt");

-- CreateIndex
CREATE INDEX "coupons_expiresAt_idx" ON "coupons"("expiresAt");

-- CreateIndex
CREATE INDEX "coupon_applicable_plans_couponId_idx" ON "coupon_applicable_plans"("couponId");

-- CreateIndex
CREATE INDEX "coupon_applicable_plans_planId_idx" ON "coupon_applicable_plans"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_applicable_plans_couponId_planId_key" ON "coupon_applicable_plans"("couponId", "planId");

-- CreateIndex
CREATE INDEX "coupon_usages_couponId_idx" ON "coupon_usages"("couponId");

-- CreateIndex
CREATE INDEX "coupon_usages_vendorId_idx" ON "coupon_usages"("vendorId");

-- CreateIndex
CREATE INDEX "coupon_usages_subscriptionPaymentId_idx" ON "coupon_usages"("subscriptionPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usages_couponId_subscriptionPaymentId_key" ON "coupon_usages"("couponId", "subscriptionPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCourier_vendorId_provider_key" ON "VendorCourier"("vendorId", "provider");

-- CreateIndex
CREATE INDEX "CourierOrder_vendorId_idx" ON "CourierOrder"("vendorId");

-- CreateIndex
CREATE INDEX "CourierOrder_orderId_idx" ON "CourierOrder"("orderId");

-- CreateIndex
CREATE INDEX "CourierOrder_consignmentId_idx" ON "CourierOrder"("consignmentId");

-- CreateIndex
CREATE INDEX "CourierOrder_trackingCode_idx" ON "CourierOrder"("trackingCode");

-- CreateIndex
CREATE INDEX "CourierOrder_invoice_idx" ON "CourierOrder"("invoice");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_vendorId_key" ON "CustomDomain"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_cloudflareId_key" ON "CustomDomain"("cloudflareId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_cloudflareWwwId_key" ON "CustomDomain"("cloudflareWwwId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCharge_vendorId_key" ON "DeliveryCharge"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "developer_pages_slug_key" ON "developer_pages"("slug");

-- CreateIndex
CREATE INDEX "developer_pages_displayOrder_idx" ON "developer_pages"("displayOrder");

-- CreateIndex
CREATE INDEX "developers_pageId_idx" ON "developers"("pageId");

-- CreateIndex
CREATE INDEX "developers_displayOrder_idx" ON "developers"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");

-- CreateIndex
CREATE UNIQUE INDEX "District_name_key" ON "District"("name");

-- CreateIndex
CREATE UNIQUE INDEX "documentations_title_key" ON "documentations"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_key" ON "Order"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_result_tokens_tokenHash_key" ON "payment_result_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "payment_result_tokens_expiresAt_idx" ON "payment_result_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_result_tokens_transactionType_transactionId_key" ON "payment_result_tokens"("transactionType", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "products_productId_key" ON "products"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_vendorId_idx" ON "products"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "purchased_domains_domain_key" ON "purchased_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "purchased_domains_subscriptionPaymentId_key" ON "purchased_domains"("subscriptionPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "purchased_domains_customDomainId_key" ON "purchased_domains"("customDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "purchased_domains_registrationIdempotencyKey_key" ON "purchased_domains"("registrationIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "purchased_domains_registrarOrderId_key" ON "purchased_domains"("registrarOrderId");

-- CreateIndex
CREATE INDEX "purchased_domains_vendorId_idx" ON "purchased_domains"("vendorId");

-- CreateIndex
CREATE INDEX "purchased_domains_status_idx" ON "purchased_domains"("status");

-- CreateIndex
CREATE INDEX "purchased_domains_registrationExpiresAt_idx" ON "purchased_domains"("registrationExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_type_key" ON "subscription_plans"("type");

-- CreateIndex
CREATE INDEX "subscription_plans_displayOrder_idx" ON "subscription_plans"("displayOrder");

-- CreateIndex
CREATE INDEX "subscription_plan_prices_planId_idx" ON "subscription_plan_prices"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_prices_planId_billingCycle_key" ON "subscription_plan_prices"("planId", "billingCycle");

-- CreateIndex
CREATE INDEX "vendor_subscriptions_vendorId_idx" ON "vendor_subscriptions"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_subscriptions_planId_idx" ON "vendor_subscriptions"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_transactionId_key" ON "subscription_payments"("transactionId");

-- CreateIndex
CREATE INDEX "subscription_payments_vendorId_idx" ON "subscription_payments"("vendorId");

-- CreateIndex
CREATE INDEX "subscription_payments_subscriptionId_idx" ON "subscription_payments"("subscriptionId");

-- CreateIndex
CREATE INDEX "subscription_payments_couponId_idx" ON "subscription_payments"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_checkout_drafts_vendorId_key" ON "vendor_checkout_drafts"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_checkout_drafts_planId_idx" ON "vendor_checkout_drafts"("planId");

-- CreateIndex
CREATE INDEX "vendor_checkout_drafts_expiresAt_idx" ON "vendor_checkout_drafts"("expiresAt");

-- CreateIndex
CREATE INDEX "vendor_checkout_drafts_domainQuoteExpiresAt_idx" ON "vendor_checkout_drafts"("domainQuoteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Template_templateId_key" ON "Template"("templateId");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_deviceToken_idx" ON "TrustedDevice"("userId", "deviceToken");

-- CreateIndex
CREATE UNIQUE INDEX "Image_imageKey_key" ON "Image"("imageKey");

-- CreateIndex
CREATE INDEX "Image_productId_idx" ON "Image"("productId");

-- CreateIndex
CREATE INDEX "Image_productId_imageCategory_idx" ON "Image"("productId", "imageCategory");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_userId_key" ON "Vendor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_vendorCode_key" ON "Vendor"("vendorCode");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_subDomain_key" ON "Vendor"("subDomain");

-- CreateIndex
CREATE INDEX "vendor_coupons_vendorId_idx" ON "vendor_coupons"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_coupons_affiliateId_idx" ON "vendor_coupons"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_coupons_code_vendorId_key" ON "vendor_coupons"("code", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_domain_registrants_vendorId_key" ON "vendor_domain_registrants"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorEarning_orderItemId_key" ON "VendorEarning"("orderItemId");

-- CreateIndex
CREATE INDEX "VisitorTracking_vendorId_createdAt_idx" ON "VisitorTracking"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "_TemplateToVendorCoupon_B_index" ON "_TemplateToVendorCoupon"("B");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPixelEvent" ADD CONSTRAINT "AdminPixelEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminVisitorTracking" ADD CONSTRAINT "AdminVisitorTracking_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payout_methods" ADD CONSTRAINT "affiliate_payout_methods_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_applicable_plans" ADD CONSTRAINT "coupon_applicable_plans_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_applicable_plans" ADD CONSTRAINT "coupon_applicable_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_subscriptionPaymentId_fkey" FOREIGN KEY ("subscriptionPaymentId") REFERENCES "subscription_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCourier" ADD CONSTRAINT "VendorCourier_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierOrder" ADD CONSTRAINT "CourierOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierOrder" ADD CONSTRAINT "CourierOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCharge" ADD CONSTRAINT "DeliveryCharge_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developers" ADD CONSTRAINT "developers_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "developer_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCustomer" ADD CONSTRAINT "GuestCustomer_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGenerationLog" ADD CONSTRAINT "AIGenerationLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_guestCustomerId_fkey" FOREIGN KEY ("guestCustomerId") REFERENCES "GuestCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorCouponId_fkey" FOREIGN KEY ("vendorCouponId") REFERENCES "vendor_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixelEvent" ADD CONSTRAINT "PixelEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchased_domains" ADD CONSTRAINT "purchased_domains_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchased_domains" ADD CONSTRAINT "purchased_domains_subscriptionPaymentId_fkey" FOREIGN KEY ("subscriptionPaymentId") REFERENCES "subscription_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchased_domains" ADD CONSTRAINT "purchased_domains_customDomainId_fkey" FOREIGN KEY ("customDomainId") REFERENCES "CustomDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_prices" ADD CONSTRAINT "subscription_plan_prices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "vendor_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_visitorLimitPackageId_fkey" FOREIGN KEY ("visitorLimitPackageId") REFERENCES "visitor_limit_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_checkout_drafts" ADD CONSTRAINT "vendor_checkout_drafts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_checkout_drafts" ADD CONSTRAINT "vendor_checkout_drafts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TiktokPixelEvent" ADD CONSTRAINT "TiktokPixelEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_cashouts" ADD CONSTRAINT "vendor_cashouts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_coupons" ADD CONSTRAINT "vendor_coupons_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_coupons" ADD CONSTRAINT "vendor_coupons_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_domain_registrants" ADD CONSTRAINT "vendor_domain_registrants_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEarning" ADD CONSTRAINT "VendorEarning_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEarning" ADD CONSTRAINT "VendorEarning_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorTracking" ADD CONSTRAINT "VisitorTracking_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TemplateToVendorCoupon" ADD CONSTRAINT "_TemplateToVendorCoupon_A_fkey" FOREIGN KEY ("A") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TemplateToVendorCoupon" ADD CONSTRAINT "_TemplateToVendorCoupon_B_fkey" FOREIGN KEY ("B") REFERENCES "vendor_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

