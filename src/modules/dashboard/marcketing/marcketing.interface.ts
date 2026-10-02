export interface PixelPayload {
  pixelId: string;
  pixelAccessToken: string;
  pixelTestCode?: string | null;
}

// 🔴 EventData পরিবর্তন করে DynamicEventPayload করা হলো
export interface DynamicEventPayload {
  eventName: string;
  eventId: string; // Deduplication এর জন্য ফ্রন্টএন্ড থেকে আসবে
  eventData?: any; // যেমন: { currency: 'BDT', value: 500, content_ids: ['123'] }
  customerData?: {
    email?: string;
    phone?: string;
    name?: string;
    city?: string;
    fbp?: string;
    fbc?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  };
}