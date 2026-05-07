'use strict';
const nodemailer = require('nodemailer');
require('dotenv').config();

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail(toList, subject, bodyHtml) {
  if (!EMAIL_ENABLED) {
    console.log(`[EMAIL] To: ${toList.join(', ')} | ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_USER,
      to:      toList.join(', '),
      subject: subject,
      html:    bodyHtml,
    });
  } catch (e) {
    console.error('[EMAIL ERROR]', e.message);
  }
}

module.exports = { sendEmail };