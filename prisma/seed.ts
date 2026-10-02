import 'dotenv/config' // ↵ CRITICAL: Loads DATABASE_URL from your .env file
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg' // ↵ New in Prisma 7

// 1. Create the database driver adapter instance
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

// 2. Pass the adapter directly into the client options
const prisma = new PrismaClient({ adapter })

const geodata = [
  {
    division: 'Barishal',
    districts: ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
  },
  {
    division: 'Chattogram',
    districts: [
      'Bandarban',
      'Brahmanbaria',
      'Chandpur',
      'Chattogram',
      "Cox's Bazar",
      'Cumilla',
      'Feni',
      'Khagrachhari',
      'Lakshmipur',
      'Noakhali',
      'Rangamati',
    ],
  },
  {
    division: 'Dhaka',
    districts: [
      'Dhaka',
      'Faridpur',
      'Gazipur',
      'Gopalganj',
      'Kishoreganj',
      'Madaripur',
      'Manikganj',
      'Munshiganj',
      'Narayanganj',
      'Narsingdi',
      'Rajbari',
      'Shariatpur',
      'Tangail',
    ],
  },
  {
    division: 'Khulna',
    districts: [
      'Bagerhat',
      'Chuadanga',
      'Jashore',
      'Jhenaidah',
      'Khulna',
      'Kushtia',
      'Magura',
      'Meherpur',
      'Narail',
      'Satkhira',
    ],
  },
  {
    division: 'Mymensingh',
    districts: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
  },
  {
    division: 'Rajshahi',
    districts: [
      'Bogura',
      'Chapai Nawabganj',
      'Joypurhat',
      'Naogaon',
      'Natore',
      'Pabna',
      'Rajshahi',
      'Sirajganj',
    ],
  },
  {
    division: 'Rangpur',
    districts: [
      'Dinajpur',
      'Gaibandha',
      'Kurigram',
      'Lalmonirhat',
      'Nilphamari',
      'Panchagarh',
      'Rangpur',
      'Thakurgaon',
    ],
  },
  {
    division: 'Sylhet',
    districts: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
  },
]

async function main() {
  console.log('🌱 Start seeding regional data...')

  // Check if regional data exists to prevent duplicate/foreign key errors
  const existingDivCount = await prisma.division.count()
  if (existingDivCount === 0) {
    for (const item of geodata) {
      await prisma.division.create({
        data: {
          name: item.division,
          districts: {
            create: item.districts.map((districtName) => ({
              name: districtName,
            })),
          },
        },
      })
    }
  } else {
    console.log('✅ Regional data already exists. Skipping insertion.')
  }

  const bcrypt = await import('bcrypt')
  const hashedPassword = await bcrypt.hash('Strong_password@321', 10)

  // 1. Upsert Admin
  const adminEmail = 'admin@biponiq.com'
  const adminPhone = '01700000000'
  let adminUser = await prisma.user.findFirst({
    where: { OR: [{ email: adminEmail }, { phone: adminPhone }] },
  })

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        name: 'Super Admin',
        email: adminEmail,
        phone: adminPhone,
        password: hashedPassword,
        role: 'ADMIN',
        isVerified: true,
        admin: {
          create: {
            adminAccountStatus: 'ACTIVE',
          },
        },
      },
    })
  }

  // 2. Upsert Vendor
  const division = await prisma.division.findFirst()
  const district = await prisma.district.findFirst({
    where: { divisionId: division?.id },
  })

  if (division && district) {
    const vendorEmail = 'vendor@biponiq.com'
    const vendorPhone = '01800000000'
    const subDomain = 'store'

    let vendorUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: vendorEmail }, { phone: vendorPhone }, { vendor: { subDomain } }],
      },
    })

    if (!vendorUser) {
      vendorUser = await prisma.user.create({
        data: {
          name: 'Test Vendor',
          email: vendorEmail,
          phone: vendorPhone,
          password: hashedPassword,
          role: 'VENDOR',
          isVerified: true,
          vendor: {
            create: {
              shopName: 'Biponiq Store',
              subDomain: subDomain,
              accountStatus: 'ACTIVE',
              subscriptionPlanType: 'FREE_TRIAL',
              address: {
                create: {
                  divisionId: division.id,
                  districtId: district.id,
                  area: 'Test Area',
                },
              },
            },
          },
        },
      })
    }
    console.log('✅ Admin and Vendor credentials checked/added!')
    console.log(`🔑 Admin -> Email: admin@biponiq.com | Pass: Admin@test@123`)
    console.log(`🔑 Vendor -> Email: vendor@biponiq.com | Pass: Vendor@test@123`)
  }

  // 3. Seed Default Subscription Plans
  console.log('🌱 Seeding Subscription Plans...')

  const plansData = [
    {
      name: 'Free Trial',
      type: 'FREE_TRIAL',
      isTrial: true,
      description: '3 days free trial plan for new vendors',
      prices: [{ billingCycle: 'MONTHLY', price: 0, discountPercent: 0, durationDays: 3 }],
    },
    {
      name: 'Standard',
      type: 'STANDARD',
      isTrial: false,
      description: 'Basic plan suitable for small businesses',
      prices: [
        { billingCycle: 'MONTHLY', price: 999, discountPercent: 0, durationDays: 30 },
        { billingCycle: 'SIX_MONTHS', price: 5394, discountPercent: 10, durationDays: 180 },
        { billingCycle: 'YEARLY', price: 9590, discountPercent: 20, durationDays: 365 },
      ],
    },
    {
      name: 'Medium',
      type: 'MEDIUM',
      isTrial: false,
      description: 'Growth plan for expanding stores',
      prices: [
        { billingCycle: 'MONTHLY', price: 1999, discountPercent: 0, durationDays: 30 },
        { billingCycle: 'SIX_MONTHS', price: 10794, discountPercent: 10, durationDays: 180 },
        { billingCycle: 'YEARLY', price: 19190, discountPercent: 20, durationDays: 365 },
      ],
    },
    {
      name: 'Premium',
      type: 'PREMIUM',
      isTrial: false,
      description: 'All-inclusive plan for high volume vendors',
      prices: [
        { billingCycle: 'MONTHLY', price: 3999, discountPercent: 0, durationDays: 30 },
        { billingCycle: 'SIX_MONTHS', price: 21594, discountPercent: 10, durationDays: 180 },
        { billingCycle: 'YEARLY', price: 38390, discountPercent: 20, durationDays: 365 },
      ],
    },
  ] as const

  for (const plan of plansData) {
    if (plan.type === 'FREE_TRIAL') {
      const existingTrialPlan = await prisma.subscriptionPlan.findUnique({
        where: { type: 'FREE_TRIAL' },
        select: { id: true },
      })

      if (existingTrialPlan) {
        continue
      }
    }

    const createdOrFoundPlan = await prisma.subscriptionPlan.upsert({
      where: { type: plan.type as any },
      update: {
        name: plan.name,
        description: plan.description,
        isTrial: plan.isTrial,
        isActive: true,
      },
      create: {
        name: plan.name,
        type: plan.type as any,
        isTrial: plan.isTrial,
        description: plan.description,
        isActive: true,
      },
    })

    for (const price of plan.prices) {
      await prisma.subscriptionPlanPrice.upsert({
        where: {
          planId_billingCycle: {
            planId: createdOrFoundPlan.id,
            billingCycle: price.billingCycle as any,
          },
        },
        update: {
          price: price.price,
          discountPercent: price.discountPercent,
          durationDays: price.durationDays,
          isActive: true,
        },
        create: {
          planId: createdOrFoundPlan.id,
          billingCycle: price.billingCycle as any,
          price: price.price,
          discountPercent: price.discountPercent,
          durationDays: price.durationDays,
          isActive: true,
        },
      })
    }
  }
  console.log('✅ Subscription plans seeded successfully!')

  console.log('✅ Seeding complete! 8 Divisions and 64 Districts inserted successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
