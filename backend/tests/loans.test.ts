import './setup.js';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { todayInTimeZone } from '../src/lib/dates.js';
import { captureOtps, prisma, resetDatabase, startServer } from './helpers.js';

const ALICE = '+919990000011';
const BOB = '+919990000012';

/** "YYYY-MM-DD" `days` from today in the app timezone. */
function dayOffset(days: number): string {
  const date = new Date(`${todayInTimeZone(process.env['APP_TIMEZONE'] ?? 'Asia/Kolkata')}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('loans and dashboard', () => {
  let api: Awaited<ReturnType<typeof startServer>>;
  let otps: ReturnType<typeof captureOtps>;
  let alice: string;
  let bob: string;

  // A fresh server per test, so per-IP rate-limit counters never leak between tests.
  before(() => {
    otps = captureOtps();
  });
  afterEach(() => api.close());
  after(async () => {
    otps.restore();
    await prisma.$disconnect();
  });

  async function login(phone: string): Promise<string> {
    await api.call('POST', '/auth/send-otp', { body: { phone } });
    const res = await api.call('POST', '/auth/verify-otp', { body: { phone, code: otps.lastCode(phone) } });
    return res.body.token;
  }

  beforeEach(async () => {
    api = await startServer();
    await resetDatabase();
    alice = await login(ALICE);
    bob = await login(BOB);
  });

  const addLoan = (token: string, friendName: string, amount: string | number, dueDate: string) =>
    api.call('POST', '/loans', { token, body: { friendName, amount, dueDate } });

  it('requires authentication on every loan and dashboard route', async () => {
    for (const [method, path] of [
      ['GET', '/loans'],
      ['POST', '/loans'],
      ['GET', '/loans/00000000-0000-0000-0000-000000000000'],
      ['PATCH', '/loans/00000000-0000-0000-0000-000000000000/repay'],
      ['GET', '/dashboard/summary'],
    ] as const) {
      const res = await api.call(method, path);
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.equal(res.body.error.code, 'AUTH_REQUIRED');
    }
  });

  it('creates a loan with a trimmed name and an exact 2-decimal amount', async () => {
    const res = await addLoan(alice, '  Rahul Sharma ', '125000', dayOffset(10));
    assert.equal(res.status, 201);
    assert.equal(res.body.loan.friendName, 'Rahul Sharma');
    assert.equal(res.body.loan.amount, '125000.00');
    assert.equal(res.body.loan.status, 'PENDING');
    assert.equal(res.body.loan.dueDate, dayOffset(10));
    assert.equal(res.body.loan.isOverdue, false);

    const [stored] = await prisma.$queryRaw<{ due: string }[]>`SELECT due_date::text AS due FROM loans`;
    assert.equal(stored!.due, dayOffset(10), 'due date is stored without timezone shift');
  });

  it('rejects invalid loan input with field errors', async () => {
    const cases: [unknown, string][] = [
      [{ amount: '10', dueDate: dayOffset(1) }, 'friendName'],
      [{ friendName: 'A', amount: '-5', dueDate: dayOffset(1) }, 'amount'],
      [{ friendName: 'A', amount: '0', dueDate: dayOffset(1) }, 'amount'],
      [{ friendName: 'A', amount: '10.555', dueDate: dayOffset(1) }, 'amount'],
      [{ friendName: 'A', amount: '99999999999', dueDate: dayOffset(1) }, 'amount'],
      [{ friendName: 'A', amount: '10', dueDate: '2026-02-30' }, 'dueDate'],
      [{ friendName: 'A', amount: '10', dueDate: '30/11/2026' }, 'dueDate'],
      [{ friendName: 'x'.repeat(101), amount: '10', dueDate: dayOffset(1) }, 'friendName'],
    ];
    for (const [body, field] of cases) {
      const res = await api.call('POST', '/loans', { token: alice, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details.fields[0].field, field, JSON.stringify(body));
    }
    assert.equal(await prisma.loan.count(), 0);
  });

  it('marks overdue only PENDING loans due before today', async () => {
    const past = (await addLoan(alice, 'Past', '100', dayOffset(-3))).body.loan;
    const today = (await addLoan(alice, 'Today', '100', dayOffset(0))).body.loan;
    assert.equal(past.isOverdue, true);
    assert.equal(past.daysOverdue, 3);
    assert.equal(today.isOverdue, false, 'a loan due today is not overdue yet');

    const repaid = await api.call('PATCH', `/loans/${past.id}/repay`, { token: alice });
    assert.equal(repaid.body.loan.status, 'REPAID');
    assert.equal(repaid.body.loan.isOverdue, false, 'repaid loans are never overdue');
  });

  it('lists newest first with cursor pagination and status filters', async () => {
    await addLoan(alice, 'A', '1', dayOffset(-1)); // overdue
    await addLoan(alice, 'B', '2', dayOffset(5));
    await addLoan(alice, 'C', '3', dayOffset(5));

    const page1 = await api.call('GET', '/loans?limit=2', { token: alice });
    assert.deepEqual(page1.body.loans.map((l: { friendName: string }) => l.friendName), ['C', 'B']);
    assert.ok(page1.body.nextCursor);
    const page2 = await api.call('GET', `/loans?limit=2&cursor=${page1.body.nextCursor}`, { token: alice });
    assert.deepEqual(page2.body.loans.map((l: { friendName: string }) => l.friendName), ['A']);
    assert.equal(page2.body.nextCursor, null);

    const overdue = await api.call('GET', '/loans?status=OVERDUE', { token: alice });
    assert.deepEqual(overdue.body.loans.map((l: { friendName: string }) => l.friendName), ['A']);
    const bad = await api.call('GET', '/loans?status=LOST', { token: alice });
    assert.equal(bad.status, 400);
  });

  it('searches by friend name and sorts by due date', async () => {
    await addLoan(alice, 'Rahul Sharma', '1', dayOffset(9));
    await addLoan(alice, 'Asha', '2', dayOffset(2));
    await addLoan(alice, 'rahul k', '3', dayOffset(5));
    await addLoan(bob, 'Rahul Other', '4', dayOffset(1));

    const search = await api.call('GET', '/loans?q=RAHUL', { token: alice });
    assert.deepEqual(search.body.loans.map((l: { friendName: string }) => l.friendName), ['rahul k', 'Rahul Sharma']);

    const byDue = await api.call('GET', '/loans?sort=dueDate&limit=2', { token: alice });
    assert.deepEqual(byDue.body.loans.map((l: { friendName: string }) => l.friendName), ['Asha', 'rahul k']);
    const byDue2 = await api.call('GET', `/loans?sort=dueDate&limit=2&cursor=${byDue.body.nextCursor}`, { token: alice });
    assert.deepEqual(byDue2.body.loans.map((l: { friendName: string }) => l.friendName), ['Rahul Sharma']);

    const bad = await api.call('GET', '/loans?sort=amount', { token: alice });
    assert.equal(bad.status, 400);
  });

  it('returns loan details to the owner only', async () => {
    const loan = (await addLoan(alice, 'Asha', '1500.5', dayOffset(7))).body.loan;

    const own = await api.call('GET', `/loans/${loan.id}`, { token: alice });
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.loan, loan);

    const other = await api.call('GET', `/loans/${loan.id}`, { token: bob });
    assert.equal(other.status, 404);
    assert.equal(other.body.error.code, 'LOAN_NOT_FOUND');

    const malformed = await api.call('GET', '/loans/not-a-uuid', { token: alice });
    assert.equal(malformed.status, 404);
  });

  it('repays once, rejects repeats, and blocks other users', async () => {
    const loan = (await addLoan(alice, 'Vikram', '250', dayOffset(3))).body.loan;

    const byBob = await api.call('PATCH', `/loans/${loan.id}/repay`, { token: bob });
    assert.equal(byBob.status, 404);
    assert.equal((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status, 'PENDING');

    const first = await api.call('PATCH', `/loans/${loan.id}/repay`, { token: alice });
    assert.equal(first.status, 200);
    assert.equal(first.body.loan.status, 'REPAID');

    const again = await api.call('PATCH', `/loans/${loan.id}/repay`, { token: alice });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'LOAN_ALREADY_REPAID');
  });

  it('allows only one of several concurrent repay requests', async () => {
    const loan = (await addLoan(alice, 'Race', '10', dayOffset(3))).body.loan;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.call('PATCH', `/loans/${loan.id}/repay`, { token: alice }))
    );
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 4);
  });

  it('computes the dashboard summary from the user’s own loans only', async () => {
    const empty = await api.call('GET', '/dashboard/summary', { token: alice });
    assert.equal(empty.body.summary.totalLent, '0.00');
    assert.equal(empty.body.summary.activeLoans, 0);

    await addLoan(alice, 'Rahul', '125000', dayOffset(-3)); // pending, overdue
    await addLoan(alice, 'Asha', '1500.50', dayOffset(0)); // pending, due today
    const toRepay = (await addLoan(alice, 'Vikram', '0.10', dayOffset(-10))).body.loan; // repaid
    await addLoan(alice, 'Neha', '2000', dayOffset(14)); // pending
    await api.call('PATCH', `/loans/${toRepay.id}/repay`, { token: alice });
    await addLoan(bob, 'Bob friend', '99999', dayOffset(-30)); // must not leak into Alice's totals

    const { body } = await api.call('GET', '/dashboard/summary', { token: alice });
    assert.deepEqual(
      {
        totalLent: body.summary.totalLent,
        totalRepaid: body.summary.totalRepaid,
        outstanding: body.summary.outstanding,
        overdueAmount: body.summary.overdueAmount,
        activeLoans: body.summary.activeLoans,
        overdueLoans: body.summary.overdueLoans,
        repaidLoans: body.summary.repaidLoans,
        totalLoans: body.summary.totalLoans,
      },
      {
        totalLent: '128500.60',
        totalRepaid: '0.10',
        outstanding: '128500.50',
        overdueAmount: '125000.00',
        activeLoans: 3,
        overdueLoans: 1,
        repaidLoans: 1,
        totalLoans: 4,
      }
    );
    assert.equal(body.summary.asOf, dayOffset(0));

    const bobs = await api.call('GET', '/loans', { token: bob });
    assert.equal(bobs.body.loans.length, 1, "Bob sees only his own loan");
  });
});
