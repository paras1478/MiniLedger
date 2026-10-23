import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  CORS_ORIGIN: z.string().default(''),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required. Copy backend/.env.example to backend/.env and set it.')
    .refine((url) => /^postgres(ql)?:\/\//.test(url), 'DATABASE_URL must be a postgresql:// URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Token lifetime as a jose time span, e.g. "15m", "12h", "7d". */
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s?(s|m|h|d|w)$/, 'JWT_EXPIRES_IN must look like 15m, 12h or 7d')
    .default('7d'),
  OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),
  /** IANA timezone that defines "today" for due dates and overdue status. */
  APP_TIMEZONE: z
    .string()
    .default('Asia/Kolkata')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Kolkata'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
