# Server Squad - E-Commerce Backend

> A comprehensive, scalable backend system for a full-featured e-commerce platform built with Node.js, Express, TypeScript, and Prisma.

## 📚 Documentation & Resources

- **[API Documentation (Swagger)](https://server-squad-backend.vercel.app/api-docs)** - Interactive API documentation
- **[Database ERD Diagram](https://drive.google.com/file/d/1_g0M0EQUmHSQYJyhL1cu0IcKuk9uK6Hl/view)** - Database schema visualization

## 🔄 Recent Updates

- **Admin Vendor Detail API** — New `GET /dashboard/admin/vendors/:vendorId` endpoint returns full vendor profile, active subscription, and payment history
- **Admin Plan Assignment** — `assignPlanToVendor` now supports `customDays` for flexible subscription durations and tracks `assignedByAdmin` flag in the database
- **Prisma Schema** — `VendorSubscription` model extended with `assignedByAdmin` (Boolean) and `customDays` (Int?) fields

## 🌟 Features

### Core E-Commerce Features

- **Multi-role Authentication** - Support for Admin, Vendor roles with JWT-based authentication
- **Product Management** - Complete product catalog with inventory and pricing. Each vendor can add up to **6 products** (limit enforced at backend)
- **Order Management** - Full order lifecycle from creation to delivery
- **Vendor Management** - Vendor registration, profile management, and commission handling with product quota enforcement
- **Payment Processing** - Integrated SSLCommerz payment gateway with COD support
- **Commission & Cashout** - Automated vendor commission calculations and cashout system
- **Dashboard Analytics** - Admin and vendor dashboards with sales analytics

### Advanced Features

- **Location Management** - Division and district-based delivery support
- **Subscription System** - Vendor subscription tiers and management
- **File Uploads** - Cloud storage integration with Cloudinary
- **Role-Based Access Control (RBAC)** - Fine-grained permission management
- **Email Notifications** - Automated email alerts for OTP and login alerts
- **Rate Limiting** - API request throttling for security
- **Cron Jobs** - Automated background tasks for vendor and product cleanup

## 🏗️ Architecture & Multi-Tenancy

This is a **backend-only** service that provides REST APIs for e-commerce operations:

- **Backend Responsibilities:**
  - API endpoints for product, order, vendor, and payment management
  - Enforce business logic (e.g., 6-product limit per vendor)
  - Database operations and data persistence
  - Authentication and authorization
  - Payment processing integration

- **Frontend Responsibilities:**
  - Multi-tenant UI implementation (separate dashboards for different vendors/admins)
  - Client-side request routing and state management
  - User interface and UX layer

## 🛠️ Tech Stack

### Backend Framework

- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **TypeScript** - Type-safe JavaScript

### Database & ORM

- **PostgreSQL** - Relational database
- **Prisma** - Next-generation ORM with type safety

### Authentication & Security

- **JWT (jsonwebtoken)** - JSON Web Token authentication
- **Bcrypt** - Password hashing
- **CORS** - Cross-origin resource sharing
- **Express Rate Limit** - Request rate limiting

### File Storage & Media

- **Cloudinary** - Cloud media storage and management
- **Multer** - File upload middleware

### Payment & Commerce

- **SSLCommerz** - Payment gateway integration

### Email & Notifications

- **Nodemailer** - Email sending service
- **Node-cron** - Scheduled task execution

### Code Quality

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Static type checking

### API Documentation

- **Swagger/OpenAPI** - Interactive API documentation
- **Redocly** - API documentation bundling

## 📁 Project Structure

```
server_squad-backend/
├── src/
│   ├── app.ts                 # Express application setup
│   ├── server.ts              # Server entry point
│   ├── config/                # Configuration files
│   │   ├── env.ts             # Environment variables
│   │   ├── cloudinary.ts      # Cloudinary configuration
│   │   ├── sslcommerz.ts      # Payment gateway config
│   │   └── swagger.ts         # Swagger documentation config
│   ├── middleware/            # Express middleware
│   │   ├── authenticate.ts    # Authentication middleware
│   │   ├── authorizeRoles.ts  # Role authorization
│   │   ├── rbac.middleware.ts # Role-based access control
│   │   ├── rateLimit.ts       # Rate limiting
│   │   ├── validateRequest.ts # Request validation
│   │   └── globalErrorHandler.ts # Error handling
│   ├── modules/               # Feature modules (MVC pattern)
│   │   ├── admin/             # Admin management
│   │   ├── auth/              # Authentication
│   │   ├── vendor/            # Vendor management
│   │   ├── product/           # Product catalog
│   │   ├── order/             # Order management
│   │   ├── payment/           # Payment processing
│   │   ├── cashout/           # Vendor cashout
│   │   ├── commission/        # Commission management
│   │   ├── dashboard/         # Analytics dashboards
│   │   ├── location/          # Location management
│   │   ├── upload/            # File uploads
│   │   ├── subscription/      # Subscription tiers
│   │   └── cod/               # Cash on delivery
│   ├── routes/                # API route definitions
│   ├── shared/                # Shared utilities
│   │   ├── errors/            # Custom error classes
│   │   ├── filter/            # Query filtering logic
│   │   ├── pagination/        # Pagination utilities
│   │   ├── interfaces/        # TypeScript interfaces
│   │   ├── utils/             # Helper functions
│   │   └── validators/        # Data validators (Zod)
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Utility functions
│   ├── lib/                   # Library integrations
│   └── cronJob/               # Scheduled background tasks
├── prisma/                    # Prisma ORM configuration
│   ├── schema.prisma          # Main schema
│   ├── migrations/            # Database migrations
│   ├── seed.ts                # Database seeding
│   └── [model].prisma         # Modularized schema files
├── openapi/                   # API documentation
│   ├── index.yml              # Main OpenAPI entry
│   ├── components/            # Reusable components
│   ├── paths/                 # API endpoint definitions
│   └── schemas/               # Data model schemas
├── templates/                 # Email templates
│   └── email/                 # EJS email templates
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── eslint.config.js           # ESLint configuration
├── swagger.yml                # Generated Swagger file
└── vercel.json                # Vercel deployment config
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.x
- PostgreSQL >= 12.x
- pnpm >= 9.x (or npm/yarn)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/RiseTogetherBD/server_squad-backend.git
   cd server_squad-backend
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:

   ```env
   # Server
   PORT=5000
   NODE_ENV=development

   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/server_squad

   # JWT Secrets
   JWT_ACCESS_SECRET=your_jwt_access_secret_key
   JWT_REFRESH_SECRET=your_jwt_refresh_secret_key

   # Email Configuration
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password

   # Cloudinary (Image Upload)
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret

   # SSLCommerz (Payment Gateway)
   SSLCOMMERZ_STORE_ID=your_store_id
   SSLCOMMERZ_STORE_PASSWORD=your_store_password
   SSLCOMMERZ_API_URL=https://sandbox.sslcommerz.com/gwprocess/v4/api.php
   ```

4. **Set up the database**

   ```bash
   # Run migrations
   pnpm exec prisma migrate dev

   # (Optional) Seed initial data
   pnpm exec prisma db seed
   ```

5. **Generate Prisma Client**
   ```bash
   pnpm exec prisma generate
   ```

## 📝 Available Scripts

```bash
# Development
pnpm dev              # Start development server with hot reload

# Building
pnpm build            # Build TypeScript and generate Swagger docs
pnpm type:check       # Run TypeScript type checking
pnpm lint             # Run ESLint
pnpm format           # Format code with Prettier
pnpm format:check     # Check code formatting without changes

# API Documentation
pnpm swagger:build    # Bundle OpenAPI specs into swagger.yml
pnpm swagger:dev      # Start Swagger UI in watch mode
pnpm swagger:lint     # Lint OpenAPI specifications
pnpm swagger:ui       # Start Swagger UI

# Database
pnpm exec prisma migrate dev       # Create and apply migrations
pnpm exec prisma db push          # Push schema changes to database
pnpm exec prisma studio           # Open Prisma Studio GUI
pnpm exec prisma db seed          # Run database seeding
pnpm exec prisma generate         # Generate Prisma Client
```

## 🔌 API Endpoints

### Authentication (`/api/v1/auth`)

- `POST /auth/admin/register` - Register Admin
- `POST /auth/vendor/register` - Register Vendor
- `POST /auth/verify-email` - Verify Email
- `POST /refresh-token` - Refresh JWT Token
- `POST /auth/login` - User login
- `POST /auth/logout` - Logout user

### Location (`/api/v1/location`)

- `GET /location/divisions` - Get all divisions
- `GET /location/districts` - Get districts by division

### Products (`/api/v1/products`)

- `GET /products/public` - Get public products
- `GET /products/product/{id}` - Get single product
- `GET /products/admin/products` - Get all products (Admin)
- `PATCH /products/admin/products/{id}/restore` - Restore deleted product (Admin)
- `GET /products/vendor/products` - Get products by vendor
- `POST /products/vendor/products` - Create product (max 6 per vendor)
- `PATCH /products/vendor/products/{id}` - Update product
- `DELETE /products/{id}` - Delete product

### Image Upload (`/api/v1/uploads`)

- `POST /uploads/product-images` - Upload product images
- `GET /uploads` - Get all uploaded images
- `GET /uploads/{id}` - Get single image by ID
- `PATCH /uploads/meta/{id}` - Update image metadata
- `PATCH /uploads/{id}/replace` - Replace existing image
- `DELETE /uploads/delete/{id}` - Delete an image

### Orders (`/api/v1/orders`)

- `POST /orders` - Place order
- `GET /orders` - Get all orders
- `GET /orders/{id}` - Get single order
- `PATCH /orders/{orderId}/status` - Update order status
- `GET /orders/track` - Track guest orders

### Payment (`/api/v1/payment`)

- `POST /payment/success` - SSLCommerz success callback
- `POST /payment/fail` - SSLCommerz fail callback
- `POST /payment/cancel` - SSLCommerz cancel callback
- `POST /payment/ipn` - SSLCommerz IPN callback

### Cashout (`/api/v1/cashout`)

- `GET /cashout/vendor/{vendorId}/summary` - Get vendor cashout summary
- `POST /cashout/vendor/{vendorId}/request` - Create vendor cashout request
- `GET /cashout/admin/cashouts` - Get cashout requests (Admin)
- `PATCH /cashout/admin/cashouts/{id}/status` - Update cashout status (Admin)
- `GET /cashout/admin/settings` - Get cashout settings (Admin)
- `PATCH /cashout/admin/settings` - Update cashout settings (Admin)

### Subscription (`/api/v1/subscriptions`)

- `GET /subscriptions/plans` - Get active subscription plans
- `GET /subscriptions/my-subscription` - Get my subscription
- `POST /subscriptions/checkout` - Checkout subscription plan
- `GET /subscriptions/admin/plans` - Get all subscription plans (Admin)
- `POST /subscriptions/admin/plans` - Create subscription plan (Admin)
- `PATCH /subscriptions/admin/plans/{planId}` - Update subscription plan (Admin)
- `DELETE /subscriptions/admin/plans/{planId}` - Delete subscription plan (Admin)
- `POST /subscriptions/admin/vendors/{vendorId}/trial` - Create vendor trial (Admin)
- `GET /subscriptions/admin/vendors/{vendorId}` - Get vendor subscriptions (Admin)

### Admin Dashboard (`/api/v1/admin` & `/api/v1/dashboards`)

- `GET /admin/get-all-vendor` - Get all vendors
- `PATCH /admin/update-vendor-status/{id}` - Update vendor status
- `DELETE /admin/delete-vendor-profile/{id}` - Delete vendor profile
- `GET /admin/get-all-orders` - Get all orders
- `PATCH /admin/restore-vendor/{id}` - Restore vendor profile
- `GET /admin/get-order-stats/{id}` - Get order statistics
- `GET /dashboards/admin` - Get admin dashboard statistics
- `GET /dashboards/admin/vendors` - Get admin dashboard vendor list
- `GET /dashboards/admin/customers` - Get admin dashboard guest customer list
- `PATCH /dashboards/admin/admin-account-status/{id}` - Update admin account status

### Vendor Dashboard (`/api/v1/vendor` & `/api/v1/dashboards`)

- `GET /vendor/get-vendor-profile` - Get vendor profile
- `PATCH /vendor/update-vendor-profile` - Update vendor profile
- `DELETE /vendor/delete-vendor-profile` - Delete vendor profile
- `GET /dashboards/vendor` - Get vendor dashboard statistics
- `GET /dashboards/vendor/orders` - Get vendor orders
- `PATCH /dashboards/vendor/delivery-charge` - Set vendor delivery charge
- `GET /dashboards/vendor/customers` - Get vendor guest customer list

### Customer Dashboard (`/api/v1/dashboards`)

- `GET /dashboards/customer` - Get customer dashboard data
- `GET /dashboards/customer/orders` - Get customer orders

## 🗄️ Database Schema Overview

### Core Models

- **User** - System users (Admin, Vendor, Customer)
- **Admin** - Admin-specific details
- **Vendor** - Vendor business information
- **GuestCustomer** - Guest checkout support

### E-Commerce Models

- **Product** - Product catalog
- **Order** - Customer orders
- **OrderItem** - Order line items
- **Payment** - Payment transactions
- **VendorEarning** - Vendor revenue tracking

### Commerce Features

- **Commission** - Commission settings
- **VendorCashout** - Vendor withdrawal requests
- **Subscription** - Vendor subscription plans
- **CashoutSetting** - Cashout policy configuration

### Logistics

- **Location** - Delivery areas
- **DeliveryCharge** - Location-based shipping costs
- **Address** - Customer delivery addresses

### Additional

- **Upload** - File management
- **VerificationCode** - OTP management

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - Bcrypt for password security
- **RBAC** - Fine-grained role-based access control
- **Rate Limiting** - API request throttling
- **CORS** - Cross-origin request protection
- **Input Validation** - Zod schema validation
- **Error Handling** - Comprehensive error handling middleware

## 🔄 Background Jobs

- **Vendor Cleanup Job** - Automatically clean up unverified vendors
- **Product Cleanup Job** - Remove expired or inactive products

## 📊 Deployment

The project is configured for deployment on [Vercel](https://vercel.com/) with the `vercel.json` configuration file.

### Deployment Steps

1. Push code to GitHub
2. Connect repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy with automatic CI/CD

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit changes (`git commit -m 'Add amazing feature'`)
3. Push to branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

### Code Standards

- Follow TypeScript best practices
- Run `pnpm lint` and `pnpm format` before committing
- Write meaningful commit messages
- Update API documentation in OpenAPI specs

## 📄 License

This project is licensed under the ISC License - see the package.json file for details.

## 👥 Authors

- **RiseTogetherBD** - https://github.com/RiseTogetherBD
