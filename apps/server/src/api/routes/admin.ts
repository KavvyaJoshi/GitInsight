import { Router } from 'express';
import { User, toPublicUser } from '../../models/User';
import { requireRole } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(requireRole('admin'));

adminRouter.get('/users', async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  res.json({ users: users.map(toPublicUser) });
});
