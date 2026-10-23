import './setup.js';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { captureOtps, prisma, resetDatabase, skipResendCooldown, startServer } from './helpers.js';

const PHONE = '+919990000001';

describe('phone OTP authentication', () => {
  let api: Awaited<ReturnType<typeof startServer>>;
  let otps: ReturnType<typeof captureOtps>;

  // A fresh server per test, so per-IP rate-limit counters never leak between tests.
  before(() => {
    otps = captureOtps();
  });
  beforeEach(async () => {
    api = await startServer();
  });
  afterEach(() => api.close());
  after(async () => {
    otps.restore();
    await prisma.$disconnect();
  });
  beforeEach(resetDatabase);

  const sendOtp = (phone = PHONE) => api.call('POST', '/auth/send-otp', { body: { phone } });
  const verify = (code: string, phone = PHONE) => api.call('POST', '/auth/verify-otp', { body: { phone, code } });
  const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

  it('rejects invalid phone numbers and malformed JSON', async () => {
    let res = await api.call('POST', '/auth/send-otp', { body: { phone: '98765' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(res.body.error.details.fields[0].field, 'phone');

    res = await api.call('POST', '/auth/send-otp', { rawBody: '{bad json' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('sends a 6-digit code that is logged, hashed in the DB and never returned', async () => {
    const res = await api.call('POST', '/auth/send-otp', { body: { phone: '+91 99900-00001' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.phone, PHONE, 'phone is normalized to E.164');
    assert.equal(res.body.expiresInSeconds, 300);

    const code = otps.lastCode(PHONE);
    assert.match(code, /^\d{6}$/);
    assert.ok(!JSON.stringify(res.body).includes(code), 'OTP must not appear in the response');

    const row = await prisma.otpCode.findFirstOrThrow({ where: { phone: PHONE } });
    assert.equal(row.codeHash.length, 64);
    assert.ok(!row.codeHash.includes(code));
    assert.equal(row.expiresAt.getTime() - row.createdAt.getTime(), 5 * 60 * 1000);
  });

  it('enforces a resend cooldown with Retry-After', async () => {
    await sendOtp();
    const res = await sendOtp();
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'OTP_RESEND_COOLDOWN');
    assert.ok(Number(res.headers.get('retry-after')) > 0);
  });

  it('caps sends at 5 per phone per hour', async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await sendOtp()).status, 200);
      await skipResendCooldown(PHONE);
    }
    const res = await sendOtp();
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'OTP_SEND_LIMIT_REACHED');
  });

  it('verifies a correct code once, creates the user and issues a JWT', async () => {
    await sendOtp();
    const code = otps.lastCode(PHONE);

    const wrong = await verify(wrongCode(code));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, 'OTP_INVALID');
    assert.equal(wrong.body.error.details.attemptsRemaining, 4);

    const ok = await verify(code);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.tokenType, 'Bearer');
    assert.equal(ok.body.token.split('.').length, 3);
    assert.equal(ok.body.isNewUser, true);
    assert.equal(ok.body.user.phone, PHONE);

    const reuse = await verify(code);
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error.code, 'OTP_ALREADY_USED');
  });

  it('retrieves the existing user on a second login', async () => {
    await sendOtp();
    const first = await verify(otps.lastCode(PHONE));
    await skipResendCooldown(PHONE);
    await sendOtp();
    const second = await verify(otps.lastCode(PHONE));
    assert.equal(second.body.isNewUser, false);
    assert.equal(second.body.user.id, first.body.user.id);
    assert.equal(await prisma.user.count({ where: { phone: PHONE } }), 1);
  });

  it('locks a code after 5 attempts, even under parallel guessing', async () => {
    await sendOtp();
    const code = otps.lastCode(PHONE);
    await Promise.all(Array.from({ length: 10 }, () => verify(wrongCode(code))));
    const row = await prisma.otpCode.findFirstOrThrow({ where: { phone: PHONE } });
    assert.equal(row.attempts, 5);

    const res = await verify(code);
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'OTP_ATTEMPTS_EXCEEDED');
  });

  it('invalidates the previous code when a new one is sent', async () => {
    await sendOtp();
    const oldCode = otps.lastCode(PHONE);
    await skipResendCooldown(PHONE);
    await sendOtp();
    const newCode = otps.lastCode(PHONE);
    if (oldCode !== newCode) assert.notEqual((await verify(oldCode)).status, 200);
    assert.equal((await verify(newCode)).status, 200);
  });

  it('rejects expired codes and codes never requested', async () => {
    await sendOtp();
    await prisma.$executeRaw`UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE phone = ${PHONE}`;
    const expired = await verify(otps.lastCode(PHONE));
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error.code, 'OTP_EXPIRED');

    const none = await verify('123456', '+919990000099');
    assert.equal(none.status, 400);
    assert.equal(none.body.error.code, 'OTP_NOT_FOUND');
  });

  it('protects /auth/me: missing, malformed, tampered and valid tokens', async () => {
    await sendOtp();
    const { body } = await verify(otps.lastCode(PHONE));
    const token: string = body.token;

    let res = await api.call('GET', '/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');

    res = await api.call('GET', '/auth/me', { headers: { authorization: `Token ${token}` } });
    assert.equal(res.body.error.code, 'AUTH_HEADER_INVALID');

    res = await api.call('GET', '/auth/me', { token: `${token.slice(0, -2)}xx` });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_INVALID');

    res = await api.call('GET', '/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.phone, PHONE);

    // A valid token for a deleted account stops working immediately.
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    res = await api.call('GET', '/auth/me', { token });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'USER_NOT_FOUND');
  });

  it('limits send-otp to 20 requests per IP per 15 minutes, across phone numbers', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await sendOtp(`+9199900${String(i).padStart(5, '0')}`);
      assert.equal(res.status, 200, `request ${i + 1}`);
    }
    const blocked = await sendOtp('+919990099999');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  });

  it('stores timestamps in UTC regardless of the server timezone', async () => {
    await sendOtp();
    const [row] = await prisma.$queryRaw<{ drift_seconds: number }[]>`
      SELECT abs(extract(epoch FROM (now() - created_at)))::float AS drift_seconds
      FROM otp_codes WHERE phone = ${PHONE}`;
    assert.ok(row!.drift_seconds < 60, `created_at is ${row!.drift_seconds}s away from now()`);
  });
});
