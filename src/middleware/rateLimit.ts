import { rateLimit } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import redis from '../config/redis.config.js'

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests. Try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
})

// স্ট্রিক্ট রেট লিমিট: এক IP থেকে ১ ঘণ্টায় সর্বোচ্চ ২০টি মেসেজ 
// (টোকেন এবং খরচ বাঁচানোর জন্য এটি অত্যন্ত কার্যকর)
export const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ১ ঘণ্টা
    max: 20, 
    message: { 
        success: false, 
        message: "আপনি অনেক বেশি মেসেজ পাঠিয়েছেন। অনুগ্রহ করে এক ঘণ্টা পর আবার চেষ্টা করুন।" 
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        // @ts-ignore
        sendCommand: (...args: string[]) => redis.call(...args),
    }),
});
