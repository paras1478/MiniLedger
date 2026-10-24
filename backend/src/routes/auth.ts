import { Router } from 'express';
import { z } from 'zod';

import type { OtpProvider } from '../lib/otp-provider.js';
import { otpCodeSchema, phoneSchema } from '../lib/validation.js';
import { getAuthUser, requireAuth } from '../middleware/authenticate.js';
import { createAuthLimiters } from '../middleware/rate-limit.js';
import { sendOtp, toPublicUser, verifyOtp } from '../services/auth.js';
import { sentMessage } from '../services/otp.js';

const sendOtpSchema = z.object({ phone: phoneSchema });
const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });

export function createAuthRouter(otpProvider: OtpProvider) {
  const router = Router();
  const limiters = createAuthLimiters();

  router.post('/send-otp', limiters.sendOtp, async (req, res) => {
    const { phone } = sendOtpSchema.parse(req.body ?? {});
    const result = await sendOtp(otpProvider, phone);
    res.json({ message: sentMessage(result.delivery), phone, ...result });
  });

  router.post('/verify-otp', limiters.verifyOtp, async (req, res) => {
    const { phone, code } = verifyOtpSchema.parse(req.body ?? {});
    const { token, expiresAt, isNewUser, user } = await verifyOtp(otpProvider, phone, code);
    res.json({ token, tokenType: 'Bearer', expiresAt, isNewUser, user });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: toPublicUser(getAuthUser(req)) });
  });

  return router;
}
