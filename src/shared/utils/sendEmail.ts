import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'

// export const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: env.SMTP_USER,
//     pass: env.SMTP_PASS,
//   },
// })


export const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});