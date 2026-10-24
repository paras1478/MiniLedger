import { Router } from 'express';
import { z } from 'zod';

import type { OtpProvider } from '../lib/otp-provider.js';
import { otpCodeSchema, phoneSchema } from '../lib/validation.js';
import { getAuthUser, requireAuth } from '../middleware/authenticate.js';
import { createPhoneVerificationLimiters } from '../middleware/rate-limit.js';
import {
  checkPhoneVerification,
  getPhoneVerificationStatus,
  sendPhoneVerification,
} from '../services/phone-verification.js';
import { sentMessage } from '../services/otp.js';

const sendSchema = z.object({ phone: phoneSchema });
const checkSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });

/** Verifying (or changing) the signed-in user's own phone number. Every route needs a token. */
export function createPhoneVerificationRouter(otpProvider: OtpProvider) {
  const router = Router();
  const limiters = createPhoneVerificationLimiters();
  router.use(requireAuth);

  router.get('/status', async (req, res) => {
    res.json(await getPhoneVerificationStatus(otpProvider, getAuthUser(req)));
  });

  router.post('/send', limiters.send, async (req, res) => {
    const { phone } = sendSchema.parse(req.body ?? {});
    const result = await sendPhoneVerification(otpProvider, getAuthUser(req), phone);
    res.json({ message: sentMessage(result.delivery), phone, ...result });
  });

  router.post('/check', limiters.check, async (req, res) => {
    const { phone, code } = checkSchema.parse(req.body ?? {});
    const { user, changed } = await checkPhoneVerification(otpProvider, getAuthUser(req), phone, code);
    res.json({ message: changed ? 'Phone number updated.' : 'Phone number verified.', user });
  });

  return router;
}
