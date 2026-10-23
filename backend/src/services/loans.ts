import { env } from '../config/env.js';
import { Prisma, type Loan, type LoanStatus } from '../generated/prisma/client.js';
import { daysBetween, parseDateOnly, toDateOnly, todayInTimeZone } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export type LoanFilter = LoanStatus | 'OVERDUE';
export type LoanSort = 'recent' | 'dueDate';

// Both orders end in `id` so they are total, which keeps cursor pagination stable.
const ORDER_BY: Record<LoanSort, Prisma.LoanOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }, { id: 'desc' }],
  dueDate: [{ dueDate: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

const today = () => todayInTimeZone(env.APP_TIMEZONE);

/**
 * API shape of a loan. Amounts are strings with 2 decimals ("1250.00") so no precision is lost
 * in JSON. A loan is overdue only when it is PENDING and its due date is before today.
 */
export function serializeLoan(loan: Loan, asOf: string) {
  const dueDate = toDateOnly(loan.dueDate);
  const isOverdue = loan.status === 'PENDING' && dueDate < asOf;
  return {
    id: loan.id,
    friendName: loan.friendName,
    amount: loan.amount.toFixed(2),
    dueDate,
    status: loan.status,
    isOverdue,
    daysOverdue: isOverdue ? daysBetween(dueDate, asOf) : 0,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
  };
}

/** Newest first (or soonest due first). Cursor pagination: pass the previous page's `nextCursor`. */
export async function listLoans(
  userId: string,
  options: { status?: LoanFilter; limit: number; cursor?: string; q?: string; sort?: LoanSort }
) {
  const asOf = today();
  const where: Prisma.LoanWhereInput = { userId };
  if (options.status === 'OVERDUE') {
    where.status = 'PENDING';
    where.dueDate = { lt: parseDateOnly(asOf)! };
  } else if (options.status) {
    where.status = options.status;
  }
  if (options.q) where.friendName = { contains: options.q, mode: 'insensitive' };

  const rows = await prisma.loan.findMany({
    where,
    orderBy: ORDER_BY[options.sort ?? 'recent'],
    take: options.limit + 1,
    ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
  });

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return {
    loans: page.map((loan) => serializeLoan(loan, asOf)),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    asOf,
  };
}

export async function createLoan(
  userId: string,
  input: { friendName: string; amount: string; dueDate: Date }
) {
  const loan = await prisma.loan.create({ data: { userId, ...input } });
  return serializeLoan(loan, today());
}

export async function getLoan(userId: string, loanId: string) {
  // Scoped to the owner; another user's loan id is indistinguishable from a missing one.
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) throw loanNotFound();
  return serializeLoan(loan, today());
}

export async function markLoanRepaid(userId: string, loanId: string) {
  // Scoped to the owner; another user's loan id is indistinguishable from a missing one.
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) throw loanNotFound();
  if (loan.status === 'REPAID') {
    throw new AppError(409, 'LOAN_ALREADY_REPAID', 'This loan is already marked as repaid.');
  }

  // The status condition makes concurrent "mark repaid" calls safe: only one succeeds.
  const updated = await prisma.loan.updateMany({
    where: { id: loanId, userId, status: 'PENDING' },
    data: { status: 'REPAID' },
  });
  if (updated.count === 0) {
    throw new AppError(409, 'LOAN_ALREADY_REPAID', 'This loan is already marked as repaid.');
  }
  return serializeLoan(await prisma.loan.findUniqueOrThrow({ where: { id: loanId } }), today());
}

export function loanNotFound() {
  return new AppError(404, 'LOAN_NOT_FOUND', 'Loan not found.');
}

/** Totals for the dashboard, computed in the database. */
export async function getDashboardSummary(userId: string) {
  const asOf = today();
  const [byStatus, overdue] = await Promise.all([
    prisma.loan.groupBy({
      by: ['status'],
      where: { userId },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.loan.aggregate({
      where: { userId, status: 'PENDING', dueDate: { lt: parseDateOnly(asOf)! } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const zero = new Prisma.Decimal(0);
  const pending = byStatus.find((group) => group.status === 'PENDING');
  const repaid = byStatus.find((group) => group.status === 'REPAID');
  const outstanding = pending?._sum.amount ?? zero;
  const totalRepaid = repaid?._sum.amount ?? zero;

  return {
    currency: 'INR',
    totalLent: outstanding.plus(totalRepaid).toFixed(2),
    totalRepaid: totalRepaid.toFixed(2),
    outstanding: outstanding.toFixed(2),
    overdueAmount: (overdue._sum.amount ?? zero).toFixed(2),
    activeLoans: pending?._count._all ?? 0,
    overdueLoans: overdue._count._all,
    repaidLoans: repaid?._count._all ?? 0,
    totalLoans: (pending?._count._all ?? 0) + (repaid?._count._all ?? 0),
    asOf,
    timeZone: env.APP_TIMEZONE,
  };
}
