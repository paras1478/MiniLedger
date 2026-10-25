import 'dotenv/config';
import { z } from 'zod';

/** Unset and empty (`KEY=`) both mean "not configured". */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

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

  /**
   * Who generates and delivers one-time codes. "twilio": Twilio Verify sends and checks them.
   * "console": codes are printed to the server log (development only; refused in production).
   * Unset: Twilio when all TWILIO_* values below are present, otherwise console outside production.
   */
  OTP_PROVIDER: z.enum(['twilio', 'console']).optional(),
  /** Twilio credentials (server-side only). Missing values disable SMS codes, not the whole API. */
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  /** Alternative to the Auth Token (recommended): an API key (SK…) and its secret. */
  TWILIO_API_KEY: optionalString,
  TWILIO_API_SECRET: optionalString,
  TWILIO_VERIFY_SERVICE_SID: optionalString,
  /** SMS-capable Twilio number (E.164). Used to text codes when no Verify service is configured. */
  TWILIO_PHONE_NUMBER: optionalString,
  /** Minimum gap between two codes for the same phone number. */
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  /** Codes per phone number per hour, across login and phone changes. */
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().min(1).max(50).default(5),
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
