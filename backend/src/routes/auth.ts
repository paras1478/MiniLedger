import { Router } from 'express';
import { z } from 'zod';

import { OTP_LENGTH } from '../config/auth.js';
import { getAuthUser, requireAuth } from '../middleware/authenticate.js';
import { createAuthLimiters } from '../middleware/rate-limit.js';
import { sendOtp, toPublicUser, verifyOtp } from '../services/auth.js';

/** Accepts "+91 98765-43210" style input and normalizes it to E.164 ("+919876543210"). */
const phoneSchema = z
  .string({ error: 'phone is required' })
  .transform((value) => value.replace(/[\s\-().]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, 'phone must be in international format with country code, e.g. +919876543210')
  );

const sendOtpSchema = z.object({ phone: phoneSchema });

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z
    .string({ error: 'code is required' })
    .trim()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `code must be ${OTP_LENGTH} digits`),
});

export function createAuthRouter() {
  const router = Router();
  const limiters = createAuthLimiters();

  router.post('/send-otp', limiters.sendOtp, async (req, res) => {
    const { phone } = sendOtpSchema.parse(req.body ?? {});
    const result = await sendOtp(phone);
    res.json({ message: 'Verification code sent.', phone, ...result });
  });

  router.post('/verify-otp', limiters.verifyOtp, async (req, res) => {
    const { phone, code } = verifyOtpSchema.parse(req.body ?? {});
    const { token, expiresAt, isNewUser, user } = await verifyOtp(phone, code);
    res.json({ token, tokenType: 'Bearer', expiresAt, isNewUser, user });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: toPublicUser(getAuthUser(req)) });
  });

  return router;
}
