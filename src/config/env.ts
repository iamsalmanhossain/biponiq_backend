import dotenv from 'dotenv'

dotenv.config()

const parseDatabaseUrl = (url?: string) => {
  if (!url) return {}

  try {
    const parsed = new URL(url)
    const dbNameRaw = parsed.pathname.substring(1).split('?')[0] || ''

    return {
      DB_HOST: parsed.hostname,
      DB_PORT: parsed.port ? Number(parsed.port) : 5432,
      DB_USER: decodeURIComponent(parsed.username),
      DB_PASSWORD: decodeURIComponent(parsed.password),
      DB_NAME: decodeURIComponent(dbNameRaw),
    }
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error)
    return {}
  }
}

const dbConfigFromUrl = parseDatabaseUrl(process.env.DATABASE_URL)

export const env = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,

  SMTP_USER: process.env.SMTP_USER as string,
  SMTP_PASS: process.env.SMTP_PASS as string,

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,

  CLIENT_URL: process.env.CLIENT_URL as string,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID as string,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET as string,

  PLATFORM_DOMAIN: process.env.PLATFORM_DOMAIN as string,
  SERVER_IP_ADDRESS: process.env.SERVER_IP_ADDRESS as string,

  FRONTEND_PAYMENT_RESULT_URL: process.env.FRONTEND_PAYMENT_RESULT_URL as string,

  // EPS payment gateway
  EPS_BASE_URL: process.env.EPS_BASE_URL as string,
  EPS_MERCHANT_ID: process.env.EPS_MERCHANT_ID as string,
  EPS_STORE_ID: process.env.EPS_STORE_ID as string,
  EPS_USERNAME: process.env.EPS_USERNAME as string,
  EPS_PASSWORD: process.env.EPS_PASSWORD as string,
  EPS_HASH_KEY: process.env.EPS_HASH_KEY as string,

  EPS_IPN_SECRET_KEY: process.env.EPS_IPN_SECRET_KEY as string,

  EPS_SUCCESS_URL: process.env.EPS_SUCCESS_URL as string,
  EPS_FAIL_URL: process.env.EPS_FAIL_URL as string,
  EPS_CANCEL_URL: process.env.EPS_CANCEL_URL as string,
  EPS_IPN_URL: process.env.EPS_IPN_URL as string,

  FRONTEND_STORE_PROTOCOL: process.env.FRONTEND_STORE_PROTOCOL as string,

  FRONTEND_STORE_ROOT_DOMAIN: process.env.FRONTEND_STORE_ROOT_DOMAIN as string,

  FRONTEND_STORE_BASE_URL: process.env.FRONTEND_STORE_BASE_URL,

  COOLIFY_API_TOKEN: process.env.COOLIFY_API_TOKEN as string,
  COOLIFY_FRONTEND_APP_UUID: process.env.COOLIFY_FRONTEND_APP_UUID as string,
  COOLIFY_API_URL: process.env.COOLIFY_API_URL as string,

  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID as string,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY as string,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME as string,
  R2_ENDPOINT: process.env.R2_ENDPOINT as string,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL as string,

  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN as string,
  CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID as string,
  CLOUDFLARE_SAAS_TARGET: process.env.CLOUDFLARE_SAAS_TARGET as string,

  PG_DUMP_PATH: process.env.PG_DUMP_PATH || 'pg_dump',
  PG_RESTORE_PATH: process.env.PG_RESTORE_PATH || 'pg_restore',

  // Namecheap domain API
  NAMECHEAP_API_BASE_URL: process.env.NAMECHEAP_API_BASE_URL as string,

  NAMECHEAP_API_USER: process.env.NAMECHEAP_API_USER as string,

  NAMECHEAP_API_KEY: process.env.NAMECHEAP_API_KEY as string,

  NAMECHEAP_CLIENT_IP: process.env.NAMECHEAP_CLIENT_IP as string,

  // Namecheap domain registration contact
  NAMECHEAP_CONTACT_FIRST_NAME: process.env.NAMECHEAP_CONTACT_FIRST_NAME as string,

  NAMECHEAP_CONTACT_LAST_NAME: process.env.NAMECHEAP_CONTACT_LAST_NAME as string,

  NAMECHEAP_CONTACT_ORGANIZATION_NAME: process.env.NAMECHEAP_CONTACT_ORGANIZATION_NAME,

  NAMECHEAP_CONTACT_ADDRESS1: process.env.NAMECHEAP_CONTACT_ADDRESS1 as string,

  NAMECHEAP_CONTACT_CITY: process.env.NAMECHEAP_CONTACT_CITY as string,

  NAMECHEAP_CONTACT_STATE_PROVINCE: process.env.NAMECHEAP_CONTACT_STATE_PROVINCE as string,

  NAMECHEAP_CONTACT_POSTAL_CODE: process.env.NAMECHEAP_CONTACT_POSTAL_CODE as string,

  NAMECHEAP_CONTACT_COUNTRY: process.env.NAMECHEAP_CONTACT_COUNTRY as string,

  NAMECHEAP_CONTACT_PHONE: process.env.NAMECHEAP_CONTACT_PHONE as string,

  NAMECHEAP_CONTACT_EMAIL: process.env.NAMECHEAP_CONTACT_EMAIL as string,

  // Domain pricing
  DOMAIN_USD_TO_BDT_RATE: process.env.DOMAIN_USD_TO_BDT_RATE as string,

  NAMECHEAP_ICANN_FEE_FALLBACK_USD: process.env.NAMECHEAP_ICANN_FEE_FALLBACK_USD as string,

  DOMAIN_MARKUP_PERCENT: process.env.DOMAIN_MARKUP_PERCENT as string,

  DOMAIN_QUOTE_TTL_MINUTES: process.env.DOMAIN_QUOTE_TTL_MINUTES as string,

  // DATABASE_URL takes priority when available.
  DB_PORT: dbConfigFromUrl.DB_PORT || Number(process.env.DB_PORT) || 5432,

  DB_HOST: dbConfigFromUrl.DB_HOST || (process.env.DB_HOST as string) || '',

  DB_NAME: dbConfigFromUrl.DB_NAME || (process.env.DB_NAME as string) || '',

  DB_USER: dbConfigFromUrl.DB_USER || (process.env.DB_USER as string) || '',

  DB_PASSWORD: dbConfigFromUrl.DB_PASSWORD || (process.env.DB_PASSWORD as string) || '',

  // gemini api key
  GEMINI_API_KEY: process.env.GEMINI_API_KEY as string,

  // redis url
  REDIS_URL: process.env.REDIS_URL as string,
}
