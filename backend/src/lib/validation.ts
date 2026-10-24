import { z } from 'zod';

import { OTP_LENGTH } from '../config/auth.js';

/**
 * Accepts "+91 98765-43210" or "0091 98765 43210" style input and normalizes it to E.164
 * ("+919876543210"). Validated on the server; the app's own checks are only a convenience.
 */
export const phoneSchema = z
  .string({ error: 'phone is required' })
  .transform((value) => value.replace(/[\s\-().]/g, '').replace(/^00/, '+'))
  .pipe(
    z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, 'phone must be in international format with country code, e.g. +919876543210')
  );

export const otpCodeSchema = z
  .string({ error: 'code is required' })
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `code must be ${OTP_LENGTH} digits`);
