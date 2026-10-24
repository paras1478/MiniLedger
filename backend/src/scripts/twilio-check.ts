// Read-only Twilio diagnostics: are the credentials valid, is the account a trial, which Verify
// service is used, and what happened to recent codes for a number. Never prints secrets or codes.
//
//   npm run twilio:check                         account, balance, Verify service(s), caller IDs
//   npm run twilio:check -- --phone +919876543210  also: recent Verify attempts to that number
//   npm run twilio:check -- --send +919876543210   manual integration test: sends ONE real SMS
import { env } from '../config/env.js';
import { createTwilioClient, maskPhone, resolveOtpProvider, twilioCredentials } from '../lib/otp-provider.js';
import { phoneSchema } from '../lib/validation.js';

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const describe = (value: string | undefined, prefix: string) =>
  !value ? 'MISSING' : value.startsWith(prefix) ? `set (${prefix}…${value.slice(-4)})` : `set, but does not start with "${prefix}"`;
const twilioFailure = (error: unknown) => {
  const e = error as { status?: number; code?: number; moreInfo?: string };
  return `status=${e.status ?? 'none'} code=${e.code ?? 'none'}${e.moreInfo ? ` (${e.moreInfo})` : ''}`;
};

const { TWILIO_ACCOUNT_SID: sid, TWILIO_VERIFY_SERVICE_SID: serviceSid } = env;
const credentials = twilioCredentials();

console.log('Configuration (backend/.env, as loaded by the API):');
console.log(`  OTP_PROVIDER              ${env.OTP_PROVIDER ?? '(empty: automatic)'}`);
console.log(`  TWILIO_ACCOUNT_SID        ${describe(sid, 'AC')}`);
console.log(`  TWILIO_AUTH_TOKEN         ${env.TWILIO_AUTH_TOKEN ? 'set' : 'not set'}`);
console.log(`  TWILIO_API_KEY / SECRET   ${env.TWILIO_API_KEY ? describe(env.TWILIO_API_KEY, 'SK') : 'not set'} / ${env.TWILIO_API_SECRET ? 'set' : 'not set'}`);
console.log(`  TWILIO_VERIFY_SERVICE_SID ${describe(serviceSid, 'VA')}`);
console.log(`  -> the API will use: ${resolveOtpProvider().label}`);

if (!credentials) {
  console.error('\nCannot reach Twilio without TWILIO_ACCOUNT_SID plus an Auth Token or API key + secret.');
  process.exit(1);
}
console.log(`  Authenticating with ${credentials.method}.`);

const client = createTwilioClient(credentials, 15_000);
let problems = 0;
let isTrial = false;

try {
  const account = await client.api.v2010.accounts(credentials.accountSid).fetch();
  console.log(`\nAccount: type=${account.type} status=${account.status}`);
  isTrial = account.type === 'Trial';
  if (isTrial) {
    console.log('  Trial account: SMS only reaches numbers listed under Verified Caller IDs (below),');
    console.log('  and each message carries a trial prefix. Upgrade (add billing) for other recipients.');
  }
  if (account.status !== 'active') problems++;
} catch (error) {
  problems++;
  console.error(`\nAccount check FAILED (${twilioFailure(error)}). 20003/401 = wrong SID or Auth Token.`);
  process.exit(1);
}

try {
  const balance = await client.api.v2010.accounts(credentials.accountSid).balance.fetch();
  console.log(`Balance: ${balance.balance} ${balance.currency}`);
  if (Number(balance.balance) <= 0) {
    problems++;
    console.log('  No credit left: Twilio can refuse to send SMS. Add funds (or upgrade the trial) in Console > Billing.');
  }
} catch (error) {
  console.log(`Balance: not available (${twilioFailure(error)})`);
}

try {
  const callerIds = await client.api.v2010.accounts(credentials.accountSid).outgoingCallerIds.list({ limit: 50 });
  console.log(`Verified Caller IDs (${callerIds.length}): ${callerIds.map((c) => maskPhone(c.phoneNumber)).join(', ') || 'none'}`);
  if (isTrial && callerIds.length === 0) {
    problems++;
    console.log('  Trial account without Verified Caller IDs: no phone can receive SMS. Add yours in');
    console.log('  Console > Phone Numbers > Manage > Verified Caller IDs (or upgrade the account).');
  }
} catch (error) {
  console.log(`Verified Caller IDs: not available (${twilioFailure(error)})`);
}

const services = await client.verify.v2.services.list({ limit: 20 }).catch((error: unknown) => {
  problems++;
  console.error(`Verify services: listing FAILED (${twilioFailure(error)})`);
  return [];
});
console.log(`\nVerify services in this account (${services.length}):`);
for (const s of services) {
  const used = s.sid === serviceSid ? '  <- TWILIO_VERIFY_SERVICE_SID' : '';
  console.log(`  ${s.sid}  "${s.friendlyName}"  codeLength=${s.codeLength}${used}`);
}
if (!serviceSid) {
  problems++;
  console.log(
    services.length > 0
      ? '\nTWILIO_VERIFY_SERVICE_SID is not set: copy the SID of the service above into backend/.env.'
      : '\nNo Verify service exists: create one in Console > Verify > Services, then set TWILIO_VERIFY_SERVICE_SID.'
  );
  console.log('Until then the API runs in console mode and NO SMS is sent.');
} else if (!services.some((s) => s.sid === serviceSid)) {
  problems++;
  console.log(
    '\nTWILIO_VERIFY_SERVICE_SID is not a service of this account (sending would fail with 404).' +
      (services.length === 0 ? ' No Verify service exists yet: create one in Console > Verify > Services.' : ' Copy one of the SIDs above.')
  );
} else {
  const s = services.find((x) => x.sid === serviceSid)!;
  if (s.codeLength !== 6) {
    problems++;
    console.log(`\nThe service sends ${s.codeLength}-digit codes, but MiniLedger expects 6. Set Code length to 6.`);
  }
}

const lookupPhone = argValue('--phone');
if (lookupPhone && serviceSid) {
  const phone = phoneSchema.parse(lookupPhone);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const attempts = await client.verify.v2.verificationAttempts
    .list({ 'channelData.to': phone, dateCreatedAfter: since, limit: 20 })
    .catch((error: unknown) => {
      console.error(`Verify attempts lookup FAILED (${twilioFailure(error)})`);
      return [];
    });
  console.log(`\nVerify attempts to ${maskPhone(phone)} in the last 24 h (${attempts.length}):`);
  for (const a of attempts) {
    const channel = (a.channelData ?? {}) as { status?: string; error_code?: string | number };
    console.log(
      `  ${a.dateCreated.toISOString()}  ${a.verificationSid}  channel=${a.channel}` +
        ` sms=${channel.status ?? 'unknown'}${channel.error_code ? ` error=${channel.error_code}` : ''}` +
        ` conversion=${a.conversionStatus}`
    );
  }
  if (attempts.length === 0) console.log('  none: the API never asked Twilio to text this number in that period.');
}

const sendPhone = argValue('--send');
if (sendPhone) {
  if (!serviceSid) {
    console.error('\n--send needs TWILIO_VERIFY_SERVICE_SID.');
    process.exit(1);
  }
  const phone = phoneSchema.parse(sendPhone);
  try {
    const v = await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: 'sms' });
    console.log(`\nManual test: Twilio accepted verification ${v.sid} to ${maskPhone(phone)}, status=${v.status}.`);
    console.log('Accepted is not delivered: re-run with --phone in a minute to see the SMS status.');
  } catch (error) {
    problems++;
    console.error(`\nManual test send FAILED (${twilioFailure(error)})`);
  }
}

console.log(problems === 0 ? '\nNo configuration problems found.' : `\n${problems} problem(s) found (see above).`);
process.exitCode = problems === 0 ? 0 : 1;
