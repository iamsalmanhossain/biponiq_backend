import { env } from '../../config/env.js'
import { renderTemplate } from './renderTemplate.js'
import { transporter } from './sendEmail.js'

import { emailQueue } from '../../config/bullmq.config.js'

const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) => {
  await emailQueue.add('send-email', { to, subject, html })
}

export const sendVerificationEmail = async (email: string, name: string, code: string) => {
  const html = await renderTemplate('otp', {
    name,
    otp: code,
  })

  await sendEmail({
    to: email,
    subject: 'Verify Email',
    html,
  })
}

export const sendLoginAlertEmail = async (email: string) => {
  const html = await renderTemplate('login-alert', {
    email,
  })

  await sendEmail({
    to: email,
    subject: 'Login Detected',
    html,
  })
}

export const sendPasswordResetCodeEmail = async (
  email: string,
  name: string,
  code: string
) => {

  const html = await renderTemplate(
    'password-reset',
    {
      name,
      otp: code,
    }
  )

  await sendEmail({
    to: email,
    subject: 'Reset Password Code',
    html,
  })
}

export const sendBackupFailureEmail = async (
  email: string,
  name: string,
  errorDetails: string
) => {
  const html = await renderTemplate('backup-failure', {
    name,
    errorDetails,
  })

  await sendEmail({
    to: email,
    subject: '⚠️ DATABASE BACKUP FAILURE ALERT',
    html,
  })
}

export const sendCouponAndSetupEmail = async (
  email: string,
  name: string,
  couponCode: string,
  setupUrl: string
) => {
  const html = await renderTemplate('coupon-email', {
    name,
    couponCode,
    setupUrl,
  })

  await sendEmail({
    to: email,
    subject: 'Welcome to Biponiq - Your Affiliate Coupon is Ready!',
    html,
  })
}
