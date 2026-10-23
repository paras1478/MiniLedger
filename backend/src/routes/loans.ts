import { Router } from 'express';
import { z } from 'zod';

import { parseDateOnly } from '../lib/dates.js';
import { getAuthUser, requireAuth } from '../middleware/authenticate.js';
import { createLoan, getLoan, listLoans, loanNotFound, markLoanRepaid } from '../services/loans.js';

const MAX_AMOUNT = 9_999_999_999.99; // DECIMAL(12, 2)

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'REPAID', 'OVERDUE']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid('cursor must be a loan id').optional(),
  /** Case-insensitive match anywhere in the friend's name. */
  q: z.string().trim().max(100).optional().transform((value) => value || undefined),
  sort: z.enum(['recent', 'dueDate']).default('recent'),
});

const createLoanSchema = z.object({
  friendName: z
    .string({ error: 'friendName is required' })
    .trim()
    .min(1, 'friendName is required')
    .max(100, 'friendName must be at most 100 characters'),
  // Accepts 1500, 1500.5 or "1500.50"; kept as a string so it reaches the DECIMAL column exactly.
  amount: z
    .union([z.string(), z.number()], { error: 'amount is required' })
    .transform((value) => String(value).trim())
    .refine((value) => /^\d{1,10}(\.\d{1,2})?$/.test(value), 'amount must be a number with at most 2 decimal places')
    .refine((value) => Number(value) > 0, 'amount must be greater than 0')
    .refine((value) => Number(value) <= MAX_AMOUNT, 'amount is too large'),
  dueDate: z
    .string({ error: 'dueDate is required' })
    .transform((value, ctx) => {
      const date = parseDateOnly(value.trim());
      if (!date) {
        ctx.addIssue({ code: 'custom', message: 'dueDate must be a valid date in YYYY-MM-DD format' });
        return z.NEVER;
      }
      return date;
    }),
});

const loanIdSchema = z.uuid();

export const loansRouter = Router();
loansRouter.use(requireAuth);

loansRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.json(await listLoans(getAuthUser(req).id, query));
});

loansRouter.post('/', async (req, res) => {
  const input = createLoanSchema.parse(req.body ?? {});
  const loan = await createLoan(getAuthUser(req).id, input);
  res.status(201).json({ loan });
});

loansRouter.get('/:id', async (req, res) => {
  const id = loanIdSchema.safeParse(req.params.id);
  if (!id.success) throw loanNotFound();
  res.json({ loan: await getLoan(getAuthUser(req).id, id.data) });
});

loansRouter.patch('/:id/repay', async (req, res) => {
  const id = loanIdSchema.safeParse(req.params.id);
  if (!id.success) throw loanNotFound();
  const loan = await markLoanRepaid(getAuthUser(req).id, id.data);
  res.json({ loan });
});
