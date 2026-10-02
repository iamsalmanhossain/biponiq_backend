// OTP verification codes are now stored in Redis with TTL.
// Redis automatically deletes expired OTPs — no cron job needed.
export const initOtpCleanupCron = () => {
  // No-op: OTP cleanup is handled automatically by Redis TTL expiry.
}