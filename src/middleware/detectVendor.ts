import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { Vendor } from '@prisma/client'
import AppError from '../shared/errors/AppError.js'
import { prisma } from '../lib/prisma.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentVendor?: Vendor | null
    }
  }
}

export const detectVendor = async (req: Request, _res: Response, next: NextFunction) => {
  // ১. প্রক্সি বা Next.js থেকে আসা অরিজিনাল হোস্ট নেয়া
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  const rawHost = forwardedHost || req.headers.host || '';

  // ২. পোর্ট রিমুভ করা
  let host = rawHost.split(':')[0];

  if (!host) return next();

  // ৩. 'www.' রিমুভ করা (ফ্রন্টএন্ডের মতো)
  host = host.replace(/^www\./, '');

  // ৪. লোকাল টেস্টিং এর জন্য মেইন ডোমেইন ফিক্স করা
  const isLocal = host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1';
  const mainDomain = isLocal ? 'localhost' : 'biponiq.com';

  try {
    const vendor = await prisma.vendor.findFirst({
      where: {
        accountStatus: 'ACTIVE',
        OR: [
          // সাবডোমেইন লজিক
          { subDomain: host.replace(`.${mainDomain}`, '') },
          // কাস্টম ডোমেইন লজিক 
          {
            customDomain: {
              domain: host
            }
          }
        ]
      },
      include: {
        customDomain: true
      }
    });

    if (vendor) {
      req.currentVendor = vendor;
      // ডিবাগিং এর জন্য লগ (প্রয়োজন না হলে পরে কেটে দিতে পারেন)
    } else {
    }

    next();
  } catch (error) {
    console.error("Middleware Error:", error);
    next(error);
  }
}
