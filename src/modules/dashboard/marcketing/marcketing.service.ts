import axios from 'axios'
import crypto from 'crypto'
import { DynamicEventPayload, PixelPayload } from './marcketing.interface.js'
import { prisma } from '../../../lib/prisma.js'

// মেটার রিকোয়ারমেন্ট অনুযায়ী SHA256 হ্যাশ ফাংশন
const hashData = (data: string): string => {
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex')
}

// ফোন নাম্বার থেকে স্পেস বা স্পেশাল ক্যারেক্টার বাদ দেওয়ার ফাংশন
const sanitizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '')
}

const savePixelCredentials = async (userId: string, payload: PixelPayload) => {
  return prisma.vendor.update({
    where: { userId: userId },
    data: {
      pixelId: payload.pixelId,
      pixelAccessToken: payload.pixelAccessToken,
      pixelTestCode: payload.pixelTestCode || null,
    },
    select: { id: true },
  })
}

const sendCAPIEvent = async (vendorId: string, payloadData: DynamicEventPayload) => {
  // 🔴 স্টোরফ্রন্ট থেকে হিট আসলে vendorId (Vendor টেবিলের id) দিয়ে খুঁজতে হবে
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId }, 
    select: { pixelId: true, pixelAccessToken: true, pixelTestCode: true },
  })

  if (!vendor?.pixelId || !vendor?.pixelAccessToken) {
    throw new Error('Facebook Pixel or Access Token not configured for this vendor.')
  }

  const url = `https://graph.facebook.com/v19.0/${vendor.pixelId}/events`
  
  const { eventName, eventId, eventData, customerData } = payloadData;

  // কাস্টমার ডেটা থাকলে সেটি ক্লিন এবং হ্যাশ করা
  const hashedEmail = customerData?.email ? hashData(customerData.email) : undefined;
  const hashedPhone = customerData?.phone ? hashData(sanitizePhone(customerData.phone)) : undefined;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId, // 🔴 ফ্রন্টএন্ড থেকে আসা আইডি
        action_source: 'website',
        user_data: {
          ...(hashedEmail && { em: [hashedEmail] }),
          ...(hashedPhone && { ph: [hashedPhone] }),
          ...(customerData?.fbp && { fbp: customerData.fbp }),
          ...(customerData?.fbc && { fbc: customerData.fbc }),
          ...(customerData?.client_ip_address && { client_ip_address: customerData.client_ip_address }),
          ...(customerData?.client_user_agent && { client_user_agent: customerData.client_user_agent }),
        },
        custom_data: eventData || {}, // ডাইনামিক ডেটা
      },
    ],
    access_token: vendor.pixelAccessToken,
    ...(vendor.pixelTestCode && { test_event_code: vendor.pixelTestCode }),
  }

  try {
    const response = await axios.post(url, payload)
    return response.data
  } catch (error: any) {
    const metaError = error.response?.data?.error?.message || error.message
    console.error(`[Meta CAPI Error - Vendor: ${vendorId}]:`, metaError)

    throw new Error(`Failed to send event to Meta CAPI: ${metaError}`, { cause: error })
  }
}

export const MarketingService = {
  savePixelCredentials,
  sendCAPIEvent,
}