import { Router } from 'express';
import { z } from 'zod';
import { getUsage, listActivity, listUsers, runAlertsNow, setUserStatus } from '../../services/admin.service';
import { requireRole } from '../middleware/auth';

export const adminRouter = Router();

// Role-based access control for every admin route (REQ-ADMIN-001, REQ-SEC-006).
adminRouter.use(requireRole('admin'));

adminRouter.get('/usage', async (_req, res) => {
  res.json(await getUsage());
});

adminRouter.get('/users', async (_req, res) => {
  res.json({ users: await listUsers() });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['active', 'deactivated']) }).parse(req.body);
  res.json({ user: await setUserStatus(req.user!, req.params.id, status, req.ip) });
});

adminRouter.get('/logs', async (req, res) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      before: z.coerce.date().optional(),
      action: z.string().max(40).optional(),
    })
    .parse(req.query);
  res.json(await listActivity(query.limit, query.before, query.action));
});

adminRouter.post('/alerts/run', async (req, res) => {
  res.json(await runAlertsNow(req.user!, req.ip));
});
