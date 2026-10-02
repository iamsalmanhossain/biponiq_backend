import { Request, Response } from 'express';
import { MarketingService } from './marcketing.service.js';
import catchAsync from '../../../shared/utils/catchAsync.js';

// ১. ভেন্ডর ড্যাশবোর্ড থেকে পিক্সেল সেটআপ করার API (Protected - ভেন্ডর লগইন করা থাকবে)
const updateCredentials = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { pixelId, pixelAccessToken, pixelTestCode } = req.body;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: User ID is missing.',
    });
    return;
  }

  if (!pixelId || !pixelAccessToken) {
    res.status(400).json({
      success: false,
      message: 'pixelId and pixelAccessToken are required.',
    });
    return;
  }

  await MarketingService.savePixelCredentials(userId as string, {
    pixelId,
    pixelAccessToken,
    pixelTestCode,
  });

  res.status(200).json({
    success: true,
    message: 'Facebook Pixel credentials updated successfully!',
  });
});

// ২. স্টোরফ্রন্ট থেকে ইভেন্ট ট্র্যাক করার API (Public - কাস্টমার ভিজিট করবে)
const trackDynamicEvent = catchAsync(async (req: Request, res: Response) => {
  // 🔴 পরিবর্তন ১: এখানে req.user এর বদলে URL params থেকে vendorId নেওয়া হচ্ছে
  const { vendorId } = req.params; 
  
  // 🔴 পরিবর্তন ২: ফ্রন্টএন্ড থেকে ডায়নামিক ডেটা (Deduplication এর জন্য) নেওয়া হচ্ছে
  const { eventName, eventId, eventData, customerData } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const enrichedCustomerData = {
    ...customerData,
    client_ip_address: clientIp
  };

  // ইনপুট ভ্যালিডেশন
  if (!vendorId || !eventName || !eventId) {
    res.status(400).json({
      success: false,
      message: 'vendorId, eventName, and eventId are required.',
    });
    return;
  }

  // সার্ভিসে vendorId এবং ডায়নামিক ডেটা পাস করা হচ্ছে
  // Pixel না থাকলে gracefully skip করা হয় — Global Error Handler কে disturb করা হয় না
  try {
    const result = await MarketingService.sendCAPIEvent(vendorId as string, {
      eventName,
      eventId,
      eventData,
      customerData: enrichedCustomerData
    });

    res.status(200).json({
      success: true,
      message: 'Event tracked and sent to Meta CAPI successfully!',
      metaResponse: result,
    });
  } catch (error: any) {
    // Pixel configured না থাকলে এটা expected — শুধু frontend কে জানাই, log করি না
    if (error?.message?.includes('Facebook Pixel or Access Token not configured')) {
      res.status(200).json({
        success: false,
        message: 'CAPI skipped: Pixel not configured for this vendor.',
      });
      return;
    }
    // অন্য unexpected error হলে re-throw করো
    throw error;
  }
});

export const MarketingController = {
  updateCredentials,
  trackDynamicEvent, // 🔴 ফাংশনের নাম আপডেট করা হয়েছে
};