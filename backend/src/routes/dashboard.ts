import { Router } from 'express';

import { getAuthUser, requireAuth } from '../middleware/authenticate.js';
import { getDashboardSummary } from '../services/loans.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', requireAuth, async (req, res) => {
  res.json({ summary: await getDashboardSummary(getAuthUser(req).id) });
});
