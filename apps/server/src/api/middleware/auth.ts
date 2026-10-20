import type { RequestHandler } from 'express';
import { HttpError } from '../../lib/errors';
import { User, type Role, type UserDoc } from '../../models/User';
import { verifyAccessToken } from '../../services/tokens';

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
    }
  }
}

const invalidToken = () => new HttpError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.');
const authRequired = () => new HttpError(401, 'AUTH_REQUIRED', 'Please log in to use this feature.');

/** Attaches req.user when a valid Bearer token is present; guests pass through untouched. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  let userId: string;
  try {
    userId = verifyAccessToken(header.slice(7)).sub;
  } catch {
    return next(invalidToken());
  }
  // Load the user on every request so deactivation and role changes apply immediately.
  const user = await User.findById(userId);
  if (!user) return next(invalidToken());
  if (user.status !== 'active') return next(new HttpError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.'));
  req.user = user;
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : authRequired());
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(authRequired());
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', 'Access denied. You do not have permission to view this page.'));
    }
    next();
  };
}
