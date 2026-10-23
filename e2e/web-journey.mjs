// MiniLedger end-to-end journey: drives the Expo web build in headless Chrome against the real API.
// See README "End-to-end browser test" for how to run it.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

// Path of the file the API's stdout is redirected to (OTP codes are read from it).
const API_LOG = process.env.API_LOG;
if (!API_LOG) throw new Error('Set API_LOG to the file the API output is written to (see README).');
// psql does not accept Prisma's ?schema= parameter, so drop the query string.
const TEST_DB = (process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/miniledger_test').split('?')[0];
const APP_URL = process.env.APP_URL ?? 'http://localhost:8090';
const APP = APP_URL;
const SHOTS = new URL('./screenshots/', import.meta.url);
mkdirSync(SHOTS, { recursive: true });
const PHONE_DIGITS = '9990001234';
const PHONE = `+91${PHONE_DIGITS}`;

const results = [];
const consoleProblems = [];
let step = 0;

function ddmmyyyy(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function lastOtp() {
  const raw = readFileSync(API_LOG);
  // Windows PowerShell 5.1 redirection writes UTF-16LE (BOM FF FE); cmd and bash write UTF-8.
  const content = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
  const lines = content.split('\n').filter((l) => l.includes(`[OTP] ${PHONE} `));
  return lines.at(-1)?.match(/-> (\d{6})/)?.[1];
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-first-run', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (['error', 'warn'].includes(m.type())) consoleProblems.push(`${m.type()}: ${m.text().slice(0, 400)}`);
});
page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message.slice(0, 400)}`));
page.on('dialog', (d) => d.accept());
page.on('error', (e) => console.log('[page crashed]', e.message));
page.on('framenavigated', (f) => f === page.mainFrame() && console.log('[navigated]', f.url()));
page.on('requestfailed', (r) => r.url().includes('4100') && console.log('[request failed]', r.method(), r.url(), r.failure()?.errorText)); // confirm() dialogs for repay / sign out

const text = () => page.evaluate(() => document.body.innerText).catch((e) => `<unavailable: ${e.message}>`);
const waitText = (t, timeout = 30_000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t);
const waitNoText = (t, timeout = 30_000) =>
  page.waitForFunction((s) => !document.body.innerText.includes(s), { timeout }, t);
// Inactive tab screens stay mounted (hidden behind the active one), so text/label lookups must
// only consider elements that are actually the topmost thing at their on-screen position.
const VISIBLE_FN = `(el) => {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
  const hit = document.elementFromPoint(r.left + r.width / 2, y);
  return !!hit && (el.contains(hit) || hit.contains(el));
}`;
async function findVisible(predicateSrc, arg, timeout = 20_000) {
  const handle = await page.waitForFunction(
    (src, visSrc, a) => {
      const pred = eval(src), visible = eval(visSrc);
      return [...document.querySelectorAll('body *')].find((e) => pred(e, a) && visible(e)) || null;
    },
    { timeout },
    predicateSrc,
    VISIBLE_FN,
    arg
  );
  return handle.asElement();
}
async function clickText(t) {
  const el = await findVisible('(e, t) => e.childElementCount === 0 && e.textContent.trim() === t', t);
  await el.click();
}
const waitVisibleText = (t, timeout) => findVisible('(e, t) => e.childElementCount === 0 && e.textContent.includes(t)', t, timeout);
async function waitNoVisibleText(t, timeout = 20_000) {
  await page.waitForFunction(
    (visSrc, s) => {
      const visible = eval(visSrc);
      return ![...document.querySelectorAll('body *')].some((e) => e.childElementCount === 0 && e.textContent.includes(s) && visible(e));
    },
    { timeout },
    VISIBLE_FN,
    t
  );
}
async function visibleLabel(fragment) {
  return findVisible('(e, f) => (e.getAttribute("aria-label") || "").includes(f)', fragment).then((el) =>
    el.evaluate((e) => e.getAttribute('aria-label'))
  );
}
async function clickLabel(label) {
  const el = await page.waitForSelector(`[aria-label="${label}"]`, { timeout: 20_000 });
  await el.click();
}
async function clickTab(name) {
  const handle = await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll('[role="tab"], a[href]')].find(
        (e) => e.innerText.trim() === n && e.getBoundingClientRect().top > window.innerHeight - 120
      ),
    { timeout: 20_000 },
    name
  );
  const info = await handle.evaluate((e) => {
    window.__mlMarker = 'still-same-document';
    return `${e.tagName} href=${e.getAttribute('href')} role=${e.getAttribute('role')}`;
  });
  await handle.asElement().click();
  await new Promise((r) => setTimeout(r, 1500));
  const marker = await page.evaluate(() => window.__mlMarker).catch((e) => `eval failed: ${e.message}`);
  console.log(`[tab ${name}] element ${info}; after click: ${marker === 'still-same-document' ? 'SPA navigation (no reload)' : `FULL RELOAD (${marker})`}`);
}
async function fill(selector, value) {
  const el = await page.waitForSelector(selector, { timeout: 20_000 });
  await el.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 15 });
}
async function shot(name) {
  await new Promise((r) => setTimeout(r, 400)); // let entry animations settle
  await page.screenshot({ path: fileURLToPath(new URL(`${String(++step).padStart(2, '0')}-${name}.png`, SHOTS)) });
}
async function check(name, fn) {
  const before = consoleProblems.length;
  try {
    await fn();
    const newProblems = consoleProblems.slice(before);
    results.push({ name, ok: newProblems.length === 0, note: newProblems.join(' | ') });
  } catch (error) {
    const slug = name.replace(/[^a-z]+/gi, '-').slice(0, 40);
    await page.screenshot({ path: fileURLToPath(new URL(`FAIL-${slug}.png`, SHOTS)) }).catch(() => {});
    const { writeFileSync } = await import('node:fs');
    writeFileSync(fileURLToPath(new URL(`FAIL-${slug}.txt`, SHOTS)), await text());
    results.push({ name, ok: false, note: `${error.message.split('\n')[0]} | page: ${(await text()).slice(0, 250).replace(/\n/g, ' / ')}` });
  }
}
async function login() {
  await fill('input[placeholder="98765 43210"]', PHONE_DIGITS);
  await clickText('Send OTP');
  await waitText('Enter verification code');
  let code;
  for (let i = 0; i < 40 && !code; i++) {
    code = lastOtp();
    if (!code) await new Promise((r) => setTimeout(r, 250));
  }
  if (!code) throw new Error('OTP not found in API log');
  await fill('input[placeholder="••••••"]', code); // auto-submits at 6 digits
}

try {
  await check('App starts and the login screen renders', async () => {
    // The first web bundle build can trigger one dev-server reload; allow a single retry.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(APP, { waitUntil: 'networkidle2', timeout: 240_000 });
        await waitText('Sign in with your phone', 240_000);
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
        console.log(`(first load attempt failed: ${error.message.split('\n')[0]}; retrying)`);
      }
    }
    await shot('login');
  });

  await check('Client-side phone validation', async () => {
    await fill('input[placeholder="98765 43210"]', '12345');
    await clickText('Send OTP');
    await waitText('Enter your 10-digit mobile number.');
  });

  await check('OTP login (code read from the API log) opens the dashboard', async () => {
    await login();
    await waitText('Your ledger starts here');
    await shot('dashboard-empty');
  });

  await check('Add Loan opens from the empty state; past date shows a warning', async () => {
    await clickText('Add Your First Loan');
    await waitText('Friend’s name');
    await fill('input[placeholder="e.g. Rahul Sharma"]', 'Rahul Sharma');
    await fill('input[aria-label="Amount in rupees"]', '125000');
    await fill('input[placeholder="DD/MM/YYYY"]', ddmmyyyy(-3));
    await waitText('is in the past, so this loan will show as overdue');
    await shot('add-loan-overdue');
  });

  await check('Saving returns to a refreshed dashboard with the overdue loan in red', async () => {
    await clickText('Save Loan');
    await waitText('Recent Loans');
    const t = await text();
    for (const expected of ['Total Lent', '₹1,25,000', 'OVERDUE', 'Overdue by 3 days', '1 loan overdue'])
      if (!t.includes(expected)) throw new Error(`missing "${expected}"`);
    const bg = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label*="Rahul Sharma"]')][0];
      let node = el;
      while (node && getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)') node = node.parentElement;
      return node && getComputedStyle(node).backgroundColor;
    });
    if (bg !== 'rgb(254, 242, 242)') throw new Error(`overdue card background is ${bg}, expected red tint`);
    await shot('dashboard-overdue');
  });

  await check('Second loan via quick due-date chip; totals update', async () => {
    await clickText('Add New Loan');
    await fill('input[placeholder="e.g. Rahul Sharma"]', 'Asha Verma');
    await fill('input[aria-label="Amount in rupees"]', '1500.50');
    await clickLabel('Due in 1 week');
    await clickText('Save Loan');
    await waitText('₹1,26,500.50');
    const t = await text();
    if (!t.includes('Asha Verma') || !t.includes('PENDING')) throw new Error('new loan not listed as PENDING');
    await shot('dashboard-two-loans');
  });

  await check('Server-side validation errors are shown on the form', async () => {
    await clickText('Add New Loan');
    await fill('input[placeholder="e.g. Rahul Sharma"]', 'Bad Date');
    await fill('input[aria-label="Amount in rupees"]', '10');
    await fill('input[placeholder="DD/MM/YYYY"]', '30/02/2026');
    await clickText('Save Loan');
    await waitText('Enter a valid date as DD/MM/YYYY.');
    await clickLabel('Close');
    await waitText('Recent Loans');
  });

  await check('Calendar picker sets the due date', async () => {
    await clickText('Add New Loan');
    await clickLabel('Pick due date from calendar');
    await page.waitForSelector('[aria-label="Next month"]', { timeout: 20_000 });
    await shot('add-loan-calendar');
    await clickText('Today');
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    await waitText(`Due on ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
    await clickLabel('Close');
    await waitText('Recent Loans');
  });

  await check('Loans tab lists loans and filters Overdue', async () => {
    await clickTab('Loans');
    await waitVisibleText('Mark as repaid');
    await clickText('Overdue');
    await waitVisibleText('Rahul Sharma');
    await waitNoVisibleText('Asha Verma');
    await shot('loans-filter-overdue');
    await clickText('All');
    await waitVisibleText('Asha Verma');
    await shot('loans-tab');
  });

  await check('Loans tab: server-side search and sort by due date', async () => {
    await fill('input[placeholder="Search by friend’s name"]', 'asha');
    await waitVisibleText('Asha Verma');
    await waitNoVisibleText('Rahul Sharma');
    await shot('loans-search');
    await clickLabel('Clear search');
    await waitVisibleText('Rahul Sharma');
    await clickLabel('Sorted by Most recent');
    await visibleLabel('Sorted by Due date');
    // Rahul (due 3 days ago) must now come before Asha (due in a week). The "Mark as repaid"
    // buttons only exist on the Loans tab, so the hidden dashboard can't affect the order.
    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll('[aria-label^="Mark ₹"]')].map((e) => e.getAttribute('aria-label'));
      return labels.length === 2 && labels[0].includes('Rahul Sharma');
    }, { timeout: 20_000 });
    await clickLabel('Sorted by Due date');
    await visibleLabel('Sorted by Most recent');
  });

  await check('Mark as repaid updates the loan in place', async () => {
    await clickLabel('Mark ₹1,25,000 from Rahul Sharma as repaid');
    await waitNoVisibleText('Overdue by 3 days');
    const label = await visibleLabel('Rahul Sharma, ₹1,25,000');
    if (!label.endsWith('repaid')) throw new Error(`card label after repay: ${label}`);
    const buttons = await page.$$eval('[aria-label="Mark ₹1,25,000 from Rahul Sharma as repaid"]', (els) => els.length);
    if (buttons !== 0) throw new Error('"Mark as repaid" is still offered for a repaid loan');
    await shot('loans-repaid');
  });

  await check('Dashboard totals refresh after repayment', async () => {
    await clickTab('Home');
    await waitText('Nothing overdue');
    const t = await text();
    for (const expected of ['₹1,26,500.50', '₹1,25,000', '₹1,500.50', 'REPAID'])
      if (!t.includes(expected)) throw new Error(`missing "${expected}"`);
    if (t.includes('OVERDUE')) throw new Error('a repaid loan is still shown as OVERDUE');
    await shot('dashboard-after-repay');
  });

  await check('Loan details screen opens from a card', async () => {
    await clickLabel((await page.$eval('[aria-label^="Asha Verma"]', (e) => e.getAttribute('aria-label'))));
    await waitText('Loan details');
    await waitText('Recorded on');
    await shot('loan-details');
    await clickLabel('Back');
    await waitText('Recent Loans');
  });

  await check('Pull-to-refresh equivalent: reload keeps the session (token restored)', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitText('Recent Loans', 60_000);
  });

  await check('Sign out returns to login and clears the session', async () => {
    await clickTab('Settings');
    await waitText(PHONE.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2'));
    await shot('settings');
    await clickText('Sign out');
    await waitText('Sign in with your phone');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitText('Sign in with your phone', 60_000);
  });

  await check('Invalid stored token: user is signed out with a clear message', async () => {
    await page.evaluate(() => localStorage.setItem('miniledger.token', 'not-a-real-token'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitText('Your session has expired. Please log in again.', 60_000);
    // The API's 401 for the bad token is expected here; drop it from the console log.
    while (consoleProblems.at(-1)?.includes('401')) consoleProblems.pop();
    await shot('session-expired');
  });

  await check('Resend cooldown is shown to the user', async () => {
    await fill('input[placeholder="98765 43210"]', PHONE_DIGITS);
    await clickText('Send OTP');
    await waitText('before requesting another code');
    // The 429 is the expected API response for this check.
    while (consoleProblems.at(-1)?.includes('429')) consoleProblems.pop();
  });

  await check('Returning user logs in again and sees existing data', async () => {
    // Skip the 60 s resend cooldown by moving earlier codes back in time (test DB only).
    const { execSync } = await import('node:child_process');
    execSync(
      `psql "${TEST_DB}" -qc "UPDATE otp_codes SET created_at = created_at - interval '61 seconds' WHERE phone = '${PHONE}'"`
    );
    await login();
    await waitText('₹1,26,500.50');
  });
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? `\n        ${r.note}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} journey checks passed; console errors/warnings: ${consoleProblems.length}`);
for (const p of consoleProblems) console.log('   ', p);
process.exitCode = failed ? 1 : 0;
