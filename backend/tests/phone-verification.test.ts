import './setup.js';

import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';

import { signAccessToken } from '../src/lib/jwt.js';
import {
  createTwilioVerifyProvider,
  unavailableOtpProvider,
  type TwilioVerifyClient,
} from '../src/lib/otp-provider.js';
import { prisma, resetDatabase, skipResendCooldown, startServer } from './helpers.js';

const ALICE = '+919990000101';
const BOB = '+919990000102';
const NEW_NUMBER = '+919990000199';
const SERVICE_SID = `VA${'0'.repeat(32)}`;

/** An error shaped like the Twilio SDK's RestException (or a bare network error without status). */
function twilioError(status?: number, code?: number) {
  // Real Twilio messages can include the phone number; the API must never echo or log them.
  return Object.assign(new Error(`Twilio failure for ${NEW_NUMBER}`), { status, code });
}

/**
 * In-memory stand-in for Twilio Verify: one pending code per number, approved once, like the
 * real service. `failNextSend` / `failNextCheck` simulate API and network failures.
 */
function fakeTwilio() {
  const pending = new Map<string, string>();
  const sends: string[] = [];
  let nextCode = 100000;
  let nextSid = 1;
  let sendStatus = 'pending';
  let failSend: unknown = null;
  let failCheck: unknown = null;

  const client: TwilioVerifyClient = {
    verify: {
      v2: {
        services(sid) {
          assert.equal(sid, SERVICE_SID);
          return {
            verifications: {
              async create({ to, channel }) {
                assert.equal(channel, 'sms');
                if (failSend) {
                  const error = failSend;
                  failSend = null;
                  throw error;
                }
                sends.push(to);
                if (!pending.has(to)) pending.set(to, String(nextCode++));
                return { sid: `VE${String(nextSid++).padStart(32, '0')}`, status: sendStatus };
              },
            },
            verificationChecks: {
              async create({ to, code }) {
                if (failCheck) {
                  const error = failCheck;
                  failCheck = null;
                  throw error;
                }
                const expected = pending.get(to);
                if (!expected) throw twilioError(404, 20404);
                const sid = `VE${'9'.repeat(32)}`;
                if (expected !== code) return { sid, status: 'pending' };
                pending.delete(to);
                return { sid, status: 'approved' };
              },
            },
          };
        },
      },
    },
  };

  return {
    provider: createTwilioVerifyProvider(client, SERVICE_SID),
    sends,
    codeFor(phone: string) {
      const code = pending.get(phone);
      assert.ok(code, `no pending Twilio code for ${phone}`);
      return code;
    },
    failNextSend(error: unknown) {
      failSend = error;
    },
    failNextCheck(error: unknown) {
      failCheck = error;
    },
    setSendStatus(status: string) {
      sendStatus = status;
    },
  };
}

describe('Twilio Verify and phone verification', () => {
  let api: Awaited<ReturnType<typeof startServer>>;
  let twilio: ReturnType<typeof fakeTwilio>;
  // Twilio activity is logged by design; capture it (also to check nothing sensitive is logged).
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;
  let logs: string[] = [];

  beforeEach(async () => {
    await resetDatabase();
    twilio = fakeTwilio();
    api = await startServer({ otpProvider: twilio.provider });
    logs = [];
    const capture = (...args: unknown[]) => void logs.push(args.join(' '));
    console.warn = capture;
    console.error = capture;
    console.info = capture;
  });
  afterEach(async () => {
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
    await api.close();
  });
  after(() => prisma.$disconnect());

  async function login(phone: string): Promise<string> {
    const sent = await api.call('POST', '/auth/send-otp', { body: { phone } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const res = await api.call('POST', '/auth/verify-otp', { body: { phone, code: twilio.codeFor(phone) } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.token;
  }
  const send = (token: string | undefined, phone: string) =>
    api.call('POST', '/phone-verification/send', { token, body: { phone } });
  const check = (token: string | undefined, phone: string, code: string) =>
    api.call('POST', '/phone-verification/check', { token, body: { phone, code } });

  describe('login with Twilio Verify', () => {
    it('sends the code through Twilio, stores no code, and verifies through Twilio', async () => {
      const res = await api.call('POST', '/auth/send-otp', { body: { phone: '+91 99900 00101' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.delivery, 'sms');
      assert.match(res.body.message, /arrive by SMS/);
      assert.equal(res.body.phone, ALICE);
      assert.deepEqual(twilio.sends, [ALICE]);

      const row = await prisma.otpCode.findFirstOrThrow({ where: { phone: ALICE } });
      assert.equal(row.codeHash, null, 'with Twilio Verify no code or hash is stored');
      assert.equal(row.purpose, 'LOGIN');
      assert.equal(row.providerSid, `VE${'1'.padStart(32, '0')}`, 'the Twilio Verification SID is recorded');
      assert.ok(
        logs.some((l) => l.includes(row.providerSid!) && l.includes('accepted') && l.includes('+91********01')),
        'the send is logged with its SID and a masked number'
      );

      const wrong = await api.call('POST', '/auth/verify-otp', { body: { phone: ALICE, code: '000000' } });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error.code, 'OTP_INVALID');
      assert.equal(wrong.body.error.details.attemptsRemaining, 4);

      const code = twilio.codeFor(ALICE);
      const ok = await api.call('POST', '/auth/verify-otp', { body: { phone: ALICE, code } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.isNewUser, true);
      assert.ok(ok.body.user.phoneVerifiedAt, 'a new user is created with a verified phone');

      const logged = logs.join('\n');
      assert.ok(!logged.includes(ALICE), 'full phone numbers are never logged');
      assert.ok(!logged.includes(code), 'codes are never logged');
      assert.ok(!logged.includes(ok.body.token), 'tokens are never logged');
    });

    it('treats a verification Twilio did not accept as pending as a failed send', async () => {
      twilio.setSendStatus('canceled');
      const res = await api.call('POST', '/auth/send-otp', { body: { phone: ALICE } });
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'SMS_PROVIDER_UNAVAILABLE');
      assert.equal(await prisma.otpCode.count(), 0, 'no cooldown starts for a send that did not happen');
    });

    it('maps an expired Twilio verification (404) to OTP_EXPIRED', async () => {
      await api.call('POST', '/auth/send-otp', { body: { phone: ALICE } });
      twilio.failNextCheck(twilioError(404, 20404));
      const res = await api.call('POST', '/auth/verify-otp', { body: { phone: ALICE, code: '123456' } });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'OTP_EXPIRED');
    });

    it('maps Twilio send failures to safe errors and starts no cooldown for a failed send', async () => {
      const cases: [ReturnType<typeof twilioError>, number, string][] = [
        [twilioError(400, 60200), 400, 'PHONE_INVALID'],
        [twilioError(400, 60605), 400, 'PHONE_NOT_SUPPORTED'],
        [twilioError(400, 21608), 400, 'PHONE_NOT_SUPPORTED'],
        [twilioError(429, 60203), 429, 'OTP_SEND_LIMIT_REACHED'],
        [twilioError(429, 20429), 429, 'SMS_PROVIDER_BUSY'],
        [twilioError(401, 20003), 503, 'SMS_PROVIDER_ERROR'],
        [twilioError(500, 20500), 503, 'SMS_PROVIDER_UNAVAILABLE'],
        [twilioError(), 503, 'SMS_PROVIDER_UNAVAILABLE'], // network error / timeout
      ];
      for (const [error, status, code] of cases) {
        logs = [];
        twilio.failNextSend(error);
        const res = await api.call('POST', '/auth/send-otp', { body: { phone: ALICE } });
        assert.equal(res.status, status, code);
        assert.equal(res.body.error.code, code);
        assert.ok(!JSON.stringify(res.body).includes(NEW_NUMBER), 'Twilio messages are not passed through');
        const logged = logs.join('\n');
        assert.ok(logged.includes(`code=${(error as { code?: number }).code ?? 'none'}`), 'the Twilio error code is logged');
        assert.ok(!logged.includes(NEW_NUMBER) && !logged.includes(ALICE), 'numbers in logs are masked');
      }
      assert.equal(await prisma.otpCode.count(), 0, 'failed sends leave no row (no cooldown, no quota used)');

      const retry = await api.call('POST', '/auth/send-otp', { body: { phone: ALICE } });
      assert.equal(retry.status, 200, 'an immediate retry after a failed send is allowed');
    });

    it('gives the attempt back when Twilio cannot be reached during a check', async () => {
      await api.call('POST', '/auth/send-otp', { body: { phone: ALICE } });
      twilio.failNextCheck(twilioError());
      const failed = await api.call('POST', '/auth/verify-otp', { body: { phone: ALICE, code: twilio.codeFor(ALICE) } });
      assert.equal(failed.status, 503);
      assert.equal(failed.body.error.code, 'SMS_PROVIDER_UNAVAILABLE');
      assert.equal((await prisma.otpCode.findFirstOrThrow({ where: { phone: ALICE } })).attempts, 0);

      const ok = await api.call('POST', '/auth/verify-otp', { body: { phone: ALICE, code: twilio.codeFor(ALICE) } });
      assert.equal(ok.status, 200);
    });
  });

  describe('phone-verification endpoints', () => {
    it('require authentication', async () => {
      for (const res of [
        await send(undefined, NEW_NUMBER),
        await check(undefined, NEW_NUMBER, '123456'),
        await api.call('GET', '/phone-verification/status'),
      ]) {
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'AUTH_REQUIRED');
      }
      assert.equal(twilio.sends.length, 0);
    });

    it('validate the phone number and code on the server', async () => {
      const token = await login(ALICE);
      let res = await send(token, '99900');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');

      res = await check(token, NEW_NUMBER, '12ab');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details.fields[0].field, 'code');

      res = await send(token, '0091 99900 00199');
      assert.equal(res.status, 200);
      assert.equal(res.body.phone, NEW_NUMBER, '00 international prefix is normalized to E.164');
    });

    it('changes the number only after Twilio approves the code', async () => {
      const token = await login(ALICE);
      const before = await api.call('GET', '/phone-verification/status', { token });
      assert.equal(before.body.phone, ALICE);
      assert.equal(before.body.verified, true);
      assert.equal(before.body.pending, null);
      assert.equal(before.body.available, true);

      const sent = await send(token, NEW_NUMBER);
      assert.equal(sent.status, 200);
      assert.equal(sent.body.delivery, 'sms');
      const status = await api.call('GET', '/phone-verification/status', { token });
      assert.equal(status.body.pending.phone, NEW_NUMBER);
      assert.ok(status.body.pending.resendAvailableInSeconds > 0);

      const wrong = await check(token, NEW_NUMBER, '000000');
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error.code, 'OTP_INVALID');
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { phone: ALICE } })).phone, ALICE);

      const ok = await check(token, NEW_NUMBER, twilio.codeFor(NEW_NUMBER));
      assert.equal(ok.status, 200);
      assert.equal(ok.body.message, 'Phone number updated.');
      assert.equal(ok.body.user.phone, NEW_NUMBER);

      // The same token keeps working and now reports the new number.
      const me = await api.call('GET', '/auth/me', { token });
      assert.equal(me.body.user.phone, NEW_NUMBER);
      assert.ok(new Date(me.body.user.phoneVerifiedAt).getTime() > Date.now() - 60_000);
      assert.equal(await prisma.user.count({ where: { phone: ALICE } }), 0);

      const reuse = await check(token, NEW_NUMBER, '100000');
      assert.equal(reuse.body.error.code, 'OTP_ALREADY_USED');
    });

    it('re-verifies the current number without changing it', async () => {
      const token = await login(ALICE);
      await skipResendCooldown(ALICE);
      await send(token, ALICE);
      const res = await check(token, ALICE, twilio.codeFor(ALICE));
      assert.equal(res.status, 200);
      assert.equal(res.body.message, 'Phone number verified.');
      assert.equal(res.body.user.phone, ALICE);
    });

    it('applies the per-phone resend cooldown (shared with login codes)', async () => {
      const token = await login(ALICE);
      assert.equal((await send(token, NEW_NUMBER)).status, 200);
      const again = await send(token, NEW_NUMBER);
      assert.equal(again.status, 429);
      assert.equal(again.body.error.code, 'OTP_RESEND_COOLDOWN');
      assert.ok(Number(again.headers.get('retry-after')) > 0);

      // A login code request for the same number is also held back: they text the same phone.
      const loginSend = await api.call('POST', '/auth/send-otp', { body: { phone: NEW_NUMBER } });
      assert.equal(loginSend.body.error.code, 'OTP_RESEND_COOLDOWN');
      assert.equal(twilio.sends.filter((p) => p === NEW_NUMBER).length, 1);
    });

    it('rate-limits sends per signed-in user', async () => {
      const token = await login(ALICE);
      for (let i = 0; i < 10; i++) {
        assert.equal((await send(token, `+9199900002${String(i).padStart(2, '0')}`)).status, 200);
      }
      const limited = await send(token, '+919990000299');
      assert.equal(limited.status, 429);
      assert.equal(limited.body.error.code, 'RATE_LIMITED');
    });

    it("does not reveal whether a number has an account until its owner's code is entered", async () => {
      const alice = await login(ALICE);
      await login(BOB);
      await skipResendCooldown(BOB);

      // Sending to an existing account's number looks exactly like sending to a free one.
      const toBob = await send(alice, BOB);
      const toFree = await send(alice, NEW_NUMBER);
      assert.equal(toBob.status, 200);
      assert.deepEqual(Object.keys(toBob.body).sort(), Object.keys(toFree.body).sort());

      // Only someone holding Bob's phone has the code; even then Bob's number cannot be taken.
      const res = await check(alice, BOB, twilio.codeFor(BOB));
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'PHONE_IN_USE');
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { phone: ALICE } })).phone, ALICE);
      assert.equal(await prisma.user.count({ where: { phone: BOB } }), 1);
    });

    it("cannot redeem another user's code or a login code", async () => {
      const alice = await login(ALICE);
      const bob = await login(BOB);
      await send(alice, NEW_NUMBER);

      // Bob has the right code but never requested it: there is no code for *him*.
      const stolen = await check(bob, NEW_NUMBER, twilio.codeFor(NEW_NUMBER));
      assert.equal(stolen.status, 400);
      assert.equal(stolen.body.error.code, 'OTP_NOT_FOUND');
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { phone: BOB } })).phone, BOB);

      // Alice's own request is unaffected.
      assert.equal((await check(alice, NEW_NUMBER, twilio.codeFor(NEW_NUMBER))).status, 200);

      // A LOGIN code cannot be redeemed as a phone change.
      const other = '+919990000177';
      await api.call('POST', '/auth/send-otp', { body: { phone: other } });
      const viaLogin = await check(bob, other, twilio.codeFor(other));
      assert.equal(viaLogin.body.error.code, 'OTP_NOT_FOUND');
    });

    it('leaves the account unchanged and the code unused when the database update fails', async () => {
      const token = await login(ALICE);
      await send(token, NEW_NUMBER);

      const original = prisma.$transaction.bind(prisma);
      (prisma as unknown as { $transaction: unknown }).$transaction = () =>
        Promise.reject(new Error('simulated database failure'));
      let res;
      try {
        res = await check(token, NEW_NUMBER, twilio.codeFor(NEW_NUMBER));
      } finally {
        (prisma as unknown as { $transaction: unknown }).$transaction = original;
      }
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { phone: ALICE } })).phone, ALICE);
      const row = await prisma.otpCode.findFirstOrThrow({ where: { phone: NEW_NUMBER } });
      assert.equal(row.consumedAt, null);
    });
  });

  it('without Twilio configured, only sending codes fails (503); the rest of the API works', async () => {
    await api.close();
    api = await startServer({ otpProvider: unavailableOtpProvider('missing TWILIO_VERIFY_SERVICE_SID') });

    const res = await api.call('POST', '/auth/send-otp', { body: { phone: ALICE } });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'OTP_PROVIDER_NOT_CONFIGURED');
    assert.ok(!JSON.stringify(res.body).includes('TWILIO'), 'configuration details stay in the server log');

    const user = await prisma.user.create({ data: { phone: ALICE, phoneVerifiedAt: new Date() } });
    const { token } = await signAccessToken(user);
    assert.equal((await api.call('GET', '/loans', { token })).status, 200);
    const status = await api.call('GET', '/phone-verification/status', { token });
    assert.equal(status.body.available, false);
    assert.equal((await send(token, NEW_NUMBER)).status, 503);
  });
});
