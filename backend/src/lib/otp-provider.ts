import twilio from 'twilio';

import { OTP_TTL_MS } from '../config/auth.js';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

/** Outcome of checking a code with a provider that generates codes itself. */
export type OtpCheckResult = 'approved' | 'incorrect' | 'expired' | 'locked';

/**
 * Twilio accepted the request. This is *not* proof of delivery: Twilio texts the code
 * asynchronously; its delivery state is visible under Verify > Logs or via `npm run twilio:check`.
 */
export interface OtpSendReceipt {
  /** Twilio Verification SID (VE…), to look the request up in the Twilio Console. */
  sid: string;
  status: string;
}

/**
 * How one-time codes are generated and delivered.
 * - `local`: the API generates the code, stores only its HMAC and prints it to the log (development).
 * - `twilio-sms`: the API generates the code (HMAC stored, as above) and texts it from
 *   TWILIO_PHONE_NUMBER with the Twilio Messaging API.
 * - `twilio-verify`: Twilio Verify generates, sends (SMS) and checks the code; nothing is stored here.
 * - `unavailable`: delivery is not configured. Sending a code fails with a clear 503; the rest of
 *   the API keeps working.
 */
export type OtpProvider =
  | { kind: 'local'; label: string; deliver(phone: string, code: string): void }
  | { kind: 'twilio-sms'; label: string; deliver(phone: string, code: string): Promise<OtpSendReceipt> }
  | {
      kind: 'twilio-verify';
      label: string;
      send(phone: string): Promise<OtpSendReceipt>;
      check(phone: string, code: string): Promise<OtpCheckResult>;
    }
  | { kind: 'unavailable'; label: string; reason: string };

/** The slice of the Twilio SDK used here, so tests can pass a fake client. */
export interface TwilioVerifyClient {
  verify: {
    v2: {
      services(sid: string): {
        verifications: { create(options: { to: string; channel: string }): Promise<{ sid: string; status: string }> };
        verificationChecks: {
          create(options: { to: string; code: string }): Promise<{ sid: string; status: string }>;
        };
      };
    };
  };
}

/** The slice of the Twilio SDK used for plain SMS, so tests can pass a fake client. */
export interface TwilioMessagingClient {
  messages: {
    create(options: { to: string; from: string; body: string }): Promise<{
      sid: string;
      status: string;
      errorCode?: number | null;
    }>;
  } & ((sid: string) => { fetch(): Promise<{ status: string; errorCode?: number | null }> });
}

/** Message states that mean Twilio will not deliver the SMS. */
const SMS_FAILED = new Set(['failed', 'undelivered', 'canceled']);
const SMS_FINAL_CHECK_MS = 10_000;

export function createTwilioSmsProvider(client: TwilioMessagingClient, from: string): OtpProvider {
  return {
    kind: 'twilio-sms',
    label: `Twilio Messaging API (SMS from ${maskPhone(from)})`,
    async deliver(phone, code) {
      let message: { sid: string; status: string; errorCode?: number | null };
      try {
        message = await client.messages.create({
          to: phone,
          from,
          body: `Your MiniLedger code is ${code}. It expires in ${OTP_TTL_MS / 60_000} minutes. Do not share it.`,
        });
      } catch (error) {
        throw toAppError(error, 'sms', phone);
      }
      const { sid, status, errorCode } = message;
      if (SMS_FAILED.has(status) || errorCode) {
        console.warn(`[twilio] sms ${sid} to ${maskPhone(phone)}: rejected status=${status} code=${errorCode ?? 'none'}`);
        throw toAppError({ status: 400, code: errorCode ?? undefined }, 'sms', phone);
      }
      // "queued"/"accepted" means Twilio took the request, not that the phone received it.
      console.info(`[twilio] sms ${sid} to ${maskPhone(phone)}: accepted (status=${status})`);
      // Log the delivery outcome a little later; purely diagnostic, never fails the request.
      const timer = setTimeout(() => {
        client
          .messages(sid)
          .fetch()
          .then((m) =>
            console.info(`[twilio] sms ${sid} to ${maskPhone(phone)}: status=${m.status} code=${m.errorCode ?? 'none'}`)
          )
          .catch((error: unknown) => console.warn(`[twilio] sms ${sid}: status check failed (code=${twilioCode(error) ?? 'none'})`));
      }, SMS_FINAL_CHECK_MS);
      timer.unref();
      return { sid, status };
    },
  };
}

/** "+919876543210" -> "+91*******10": enough to tell numbers apart in logs without exposing them. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 3)}${'*'.repeat(phone.length - 5)}${phone.slice(-2)}` : '***';
}

/** Development only: no SMS is sent; the code is printed to the API log. `why` explains the choice. */
export function createConsoleOtpProvider(why: string): OtpProvider {
  return {
    kind: 'local',
    label: `console mode, NO SMS is sent: codes are printed to this log (${why})`,
    deliver(phone, code) {
      console.info(
        `[OTP] OTP generated for testing: ${code}  (phone ${phone}, valid ${OTP_TTL_MS / 60_000} min; development only, no SMS sent)`
      );
    },
  };
}

export function unavailableOtpProvider(reason: string): OtpProvider {
  return { kind: 'unavailable', label: `not configured: ${reason}`, reason };
}

export function createTwilioVerifyProvider(client: TwilioVerifyClient, serviceSid: string): OtpProvider {
  const service = () => client.verify.v2.services(serviceSid);
  return {
    kind: 'twilio-verify',
    label: `Twilio Verify (service …${serviceSid.slice(-4)})`,

    async send(phone) {
      let verification: { sid: string; status: string };
      try {
        verification = await service().verifications.create({ to: phone, channel: 'sms' });
      } catch (error) {
        throw toAppError(error, 'send', phone);
      }
      const { sid, status } = verification;
      if (status !== 'pending') {
        // A new verification is always "pending"; anything else means no code is on its way.
        console.warn(`[twilio] verify send ${sid} to ${maskPhone(phone)}: unexpected status=${status}`);
        throw new AppError(503, 'SMS_PROVIDER_UNAVAILABLE', "Couldn't send the code. Please try again.");
      }
      // Accepted by Twilio, not yet delivered: delivery happens asynchronously.
      console.info(`[twilio] verify send ${sid} to ${maskPhone(phone)}: accepted (status=${status})`);
      return { sid, status };
    },

    async check(phone, code) {
      try {
        const { sid, status } = await service().verificationChecks.create({ to: phone, code });
        console.info(`[twilio] verify check ${sid} for ${maskPhone(phone)}: status=${status}`);
        if (status === 'approved') return 'approved';
        if (status === 'pending') return 'incorrect'; // wrong code; the verification stays open
        if (status === 'max_attempts_reached') return 'locked';
        return 'expired'; // canceled, expired, failed, deleted
      } catch (error) {
        // 404: no pending verification for this number (expired, already approved or cancelled).
        if (twilioStatus(error) === 404 || twilioCode(error) === 20404) return 'expired';
        if (twilioCode(error) === 60202) return 'locked'; // max check attempts
        throw toAppError(error, 'check', phone);
      }
    },
  };
}

/**
 * How to authenticate with Twilio: an API key + secret when both are set (recommended, revocable),
 * otherwise the account Auth Token. Returns null when neither is complete.
 */
export function twilioCredentials() {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_API_KEY: apiKey, TWILIO_API_SECRET: apiSecret } = env;
  if (!accountSid) return null;
  if (apiKey && apiSecret) return { accountSid, username: apiKey, password: apiSecret, method: 'API key' as const };
  if (env.TWILIO_AUTH_TOKEN) {
    return { accountSid, username: accountSid, password: env.TWILIO_AUTH_TOKEN, method: 'Auth Token' as const };
  }
  return null;
}

export function createTwilioClient(credentials: NonNullable<ReturnType<typeof twilioCredentials>>, timeout = 10_000) {
  // The SDK reads nothing from the environment itself; credentials are passed explicitly.
  return twilio(credentials.username, credentials.password, { accountSid: credentials.accountSid, timeout });
}

const VERIFY_SID = /^VA[0-9a-fA-F]{32}$/;

/**
 * Picks the provider from the environment. Never throws: a misconfiguration only disables
 * one-time codes (with a clear error to clients and a warning in the log).
 */
export function resolveOtpProvider(): OtpProvider {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_VERIFY_SERVICE_SID: serviceSid, TWILIO_PHONE_NUMBER: from } = env;
  const credentials = twilioCredentials();
  const missing = [
    !sid && 'TWILIO_ACCOUNT_SID',
    sid && !credentials && 'TWILIO_AUTH_TOKEN (or TWILIO_API_KEY + TWILIO_API_SECRET)',
    !serviceSid && !from && 'TWILIO_VERIFY_SERVICE_SID or TWILIO_PHONE_NUMBER',
  ].filter(Boolean);
  // Twilio is used whenever it is configured (credentials + a Verify service or sender number).
  // Console codes are only a development fallback when it is not, or when OTP_PROVIDER=console.
  const choice = env.OTP_PROVIDER ?? (missing.length === 0 || env.NODE_ENV === 'production' ? 'twilio' : 'console');

  if (choice === 'console') {
    const why = env.OTP_PROVIDER === 'console' ? 'OTP_PROVIDER=console' : `Twilio not configured: missing ${missing.join(', ')}`;
    if (env.NODE_ENV === 'production') {
      return unavailableOtpProvider(`Twilio Verify is not configured (${why}); console codes are disabled in production`);
    }
    return createConsoleOtpProvider(why);
  }

  if (missing.length > 0) return unavailableOtpProvider(`missing ${missing.join(', ')}`);
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid!)) {
    return unavailableOtpProvider('TWILIO_ACCOUNT_SID is not an Account SID ("AC" + 32 hex characters)');
  }
  const auth = `authenticated with ${credentials!.method}`;
  // Verify when a service is configured; otherwise plain SMS from TWILIO_PHONE_NUMBER.
  if (!serviceSid) {
    if (!/^\+[1-9]\d{7,14}$/.test(from!)) {
      return unavailableOtpProvider('TWILIO_PHONE_NUMBER must be an E.164 number, e.g. +15551234567');
    }
    const provider = createTwilioSmsProvider(createTwilioClient(credentials!), from!);
    return { ...provider, label: `${provider.label}, ${auth}` };
  }
  if (!VERIFY_SID.test(serviceSid)) {
    return unavailableOtpProvider(
      'TWILIO_VERIFY_SERVICE_SID is not a Verify Service SID ("VA" + 32 hex characters; is it still a placeholder?). ' +
        'Create a service in Twilio Console > Verify > Services and copy its SID'
    );
  }
  const provider = createTwilioVerifyProvider(createTwilioClient(credentials!), serviceSid);
  return { ...provider, label: `${provider.label}, ${auth}` };
}

/** Twilio errors carry an HTTP `status` and a numeric Twilio `code`. Network errors carry neither. */
function twilioStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}
function twilioCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}

const PHONE_CANNOT_RECEIVE = "This number can't receive SMS codes. Check the number and country code.";

/**
 * Maps a Twilio failure to a safe client error. Logs Twilio's status, error code and docs link with
 * a masked number; never Twilio's message, which can contain the full phone number.
 */
function toAppError(error: unknown, operation: 'send' | 'check' | 'sms', phone: string): AppError {
  const status = twilioStatus(error);
  const code = twilioCode(error);
  const moreInfo = (error as { moreInfo?: unknown } | null)?.moreInfo;
  const rawMessage = (error as { message?: unknown } | null)?.message;
  // Twilio's text can contain phone numbers; mask every number-like sequence before logging it.
  const twilioMessage = typeof rawMessage === 'string' ? rawMessage.replace(/\+?\d[\d\s-]{6,}\d/g, (n) => maskPhone(n)) : '';
  console.warn(
    `[twilio] ${operation === 'sms' ? 'sms' : `verify ${operation}`} to ${maskPhone(phone)} failed: status=${status ?? 'none'} code=${code ?? 'none'}` +
      (twilioMessage ? ` message="${twilioMessage}"` : '') +
      (typeof moreInfo === 'string' ? ` ${moreInfo}` : '')
  );

  switch (code) {
    case 60200: // invalid parameter (usually the "to" number)
    case 21211: // invalid "To" number
    case 21614: // not a mobile number
      return new AppError(400, 'PHONE_INVALID', PHONE_CANNOT_RECEIVE);
    case 21408: // Messaging geo permissions: SMS to this country is not enabled
    case 21610: // recipient replied STOP
    case 21612: // this From/To pair cannot be used
    case 60410: // number or prefix blocked by Fraud Guard
    case 60605: // SMS to this country is disabled in the Verify geo permissions
    case 60220: // channel disabled for this country
      return new AppError(400, 'PHONE_NOT_SUPPORTED', 'Verification codes cannot be sent to this number.');
    case 21608: // trial account: recipient is not a verified caller ID
      console.warn('[twilio] trial accounts can only send to verified numbers (Twilio Console > Verified Caller IDs).');
      return new AppError(400, 'PHONE_NOT_SUPPORTED', 'Verification codes cannot be sent to this number yet.');
    case 60203: // Twilio's own cap on sends to one number
      return new AppError(
        429,
        'OTP_SEND_LIMIT_REACHED',
        'Too many codes requested for this number. Try again in 10 minutes.',
        { retryAfterSeconds: 600 },
        600
      );
  }
  if (status === 429 || code === 20429 || code === 60212) {
    return new AppError(429, 'SMS_PROVIDER_BUSY', 'The SMS service is busy. Please try again in a minute.', {
      retryAfterSeconds: 60,
    }, 60);
  }
  if (code === 572006 || code === 21219) {
    // Trial accounts may only send Twilio's predefined templates (no custom OTP text) via Messaging.
    console.error(
      '[twilio] this is a TRIAL account: the Messages API cannot send custom text. Use Twilio Verify ' +
        '(set TWILIO_VERIFY_SERVICE_SID) or upgrade the account in Console > Billing.'
    );
    return new AppError(503, 'SMS_PROVIDER_ERROR', 'Verification codes are temporarily unavailable. Please try again later.');
  }
  if (code === 21606 || code === 21659 || code === 21212 || code === 21660) {
    // The From number is not an SMS-capable number of this account.
    console.error('[twilio] TWILIO_PHONE_NUMBER cannot send SMS from this account (Console > Phone Numbers).');
    return new AppError(503, 'SMS_PROVIDER_ERROR', 'Verification codes are temporarily unavailable. Please try again later.');
  }
  if (status === 401 || status === 403 || code === 20003 || (status === 404 && operation === 'send')) {
    console.error('[twilio] check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID.');
    return new AppError(503, 'SMS_PROVIDER_ERROR', 'Verification codes are temporarily unavailable. Please try again later.');
  }
  // Timeouts, DNS/connection failures and Twilio 5xx.
  return new AppError(503, 'SMS_PROVIDER_UNAVAILABLE', "Couldn't reach the SMS service. Please try again.");
}
