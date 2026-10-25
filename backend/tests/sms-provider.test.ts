import './setup.js';

import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';

import { createTwilioSmsProvider, type TwilioMessagingClient } from '../src/lib/otp-provider.js';
import { prisma, resetDatabase, startServer } from './helpers.js';

const PHONE = '+919990000301';
const FROM = '+15005550006';

/** In-memory stand-in for the Twilio Messaging API (messages.create / messages(sid).fetch). */
function fakeMessaging() {
  const sent: { to: string; from: string; body: string }[] = [];
  let failNext: unknown = null;
  let nextStatus = 'queued';
  const messages = Object.assign((sid: string) => ({ fetch: async () => ({ status: 'delivered', errorCode: null, sid }) }), {
    async create(options: { to: string; from: string; body: string }) {
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      sent.push(options);
      return { sid: `SM${String(sent.length).padStart(32, '0')}`, status: nextStatus, errorCode: null };
    },
  });
  const client: TwilioMessagingClient = { messages };
  return {
    provider: createTwilioSmsProvider(client, FROM),
    sent,
    lastCode: () => sent.at(-1)?.body.match(/\b(\d{6})\b/)?.[1],
    failNext(error: unknown) {
      failNext = error;
    },
    setStatus(status: string) {
      nextStatus = status;
    },
  };
}

describe('OTP by SMS through the Twilio Messaging API', () => {
  let api: Awaited<ReturnType<typeof startServer>>;
  let sms: ReturnType<typeof fakeMessaging>;
  let logs: string[] = [];
  const original = { info: console.info, warn: console.warn, error: console.error };

  beforeEach(async () => {
    await resetDatabase();
    sms = fakeMessaging();
    api = await startServer({ otpProvider: sms.provider });
    logs = [];
    const capture = (...args: unknown[]) => void logs.push(args.join(' '));
    Object.assign(console, { info: capture, warn: capture, error: capture });
  });
  afterEach(async () => {
    Object.assign(console, original);
    await api.close();
  });
  after(() => prisma.$disconnect());

  it('texts the code from TWILIO_PHONE_NUMBER, records the Message SID, and logs in with it', async () => {
    const res = await api.call('POST', '/auth/send-otp', { body: { phone: '+91 99900 00301' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.delivery, 'sms');
    assert.equal(sms.sent.length, 1);
    assert.equal(sms.sent[0]!.to, PHONE, 'sent to the E.164 number');
    assert.equal(sms.sent[0]!.from, FROM);

    const code = sms.lastCode()!;
    const row = await prisma.otpCode.findFirstOrThrow({ where: { phone: PHONE } });
    assert.equal(row.codeHash?.length, 64, 'only a hash of the code is stored');
    assert.equal(row.providerSid, `SM${'1'.padStart(32, '0')}`);

    const wrong = await api.call('POST', '/auth/verify-otp', { body: { phone: PHONE, code: code === '000000' ? '111111' : '000000' } });
    assert.equal(wrong.body.error.code, 'OTP_INVALID');
    const ok = await api.call('POST', '/auth/verify-otp', { body: { phone: PHONE, code } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    const logged = logs.join('\n');
    assert.ok(logged.includes(row.providerSid!) && logged.includes('accepted (status=queued)'));
    assert.ok(!logged.includes(code), 'the code is never logged');
    assert.ok(!logged.includes(PHONE), 'numbers are masked in logs');
  });

  it('reports Twilio rejections instead of success, and starts no cooldown', async () => {
    const cases: [object, number, string][] = [
      [{ status: 400, code: 21211 }, 400, 'PHONE_INVALID'],
      [{ status: 400, code: 21608 }, 400, 'PHONE_NOT_SUPPORTED'], // trial: unverified recipient
      [{ status: 400, code: 21408 }, 400, 'PHONE_NOT_SUPPORTED'], // country not enabled
      [{ status: 400, code: 21606 }, 503, 'SMS_PROVIDER_ERROR'], // From is not this account's SMS number
      [{ status: 401, code: 20003 }, 503, 'SMS_PROVIDER_ERROR'],
      [new Error('socket hang up'), 503, 'SMS_PROVIDER_UNAVAILABLE'],
    ];
    for (const [error, status, code] of cases) {
      sms.failNext(Object.assign(new Error('Twilio error'), error));
      const res = await api.call('POST', '/auth/send-otp', { body: { phone: PHONE } });
      assert.equal(res.status, status, code);
      assert.equal(res.body.error.code, code);
    }
    sms.setStatus('failed');
    assert.equal((await api.call('POST', '/auth/send-otp', { body: { phone: PHONE } })).status, 503);
    assert.equal(await prisma.otpCode.count(), 0, 'failed sends leave no row');
  });
});
