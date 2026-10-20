import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { HttpError } from '../../lib/errors';
import { toPublicUser, type UserDoc } from '../../models/User';
import { loginWithGoogle, loginWithPassword, registerWithPassword } from '../../services/auth.service';
import { createSession, revokeSessionByToken, rotateSession, signAccessToken } from '../../services/tokens';
import { requireAuth } from '../middleware/auth';

const REFRESH_COOKIE = 'gi_refresh';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254));
const registerSchema = z.object({
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/\d/, 'Password must contain a number.'),
  name: z.string().trim().max(80).optional(),
});
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required.').max(72) });
const googleSchema = z.object({ credential: z.string().min(1).max(4096) });

function sessionMeta(req: Request) {
  return { userAgent: req.get('user-agent')?.slice(0, 200), ip: req.ip };
}

const cookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  // Strict same-site stops cross-site requests from carrying the cookie (CSRF protection).
  sameSite: 'strict' as const,
  path: '/api/auth',
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, maxAge: config.refreshTokenTtlSec * 1000 });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

async function startSession(req: Request, res: Response, user: UserDoc) {
  const { refreshToken } = await createSession(user._id, sessionMeta(req));
  setRefreshCookie(res, refreshToken);
  return { accessToken: signAccessToken(user), user: toPublicUser(user) };
}

export const authRouter = Router();

authRouter.get('/config', (_req, res) => {
  res.json({ googleClientId: config.googleClientId || null });
});

authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerWithPassword(input);
  res.status(201).json(await startSession(req, res, user));
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await loginWithPassword(email, password);
  res.json(await startSession(req, res, user));
});

authRouter.post('/google', async (req, res) => {
  const { credential } = googleSchema.parse(req.body);
  const user = await loginWithGoogle(credential);
  res.json(await startSession(req, res, user));
});

authRouter.post('/refresh', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new HttpError(401, 'NO_SESSION', 'No active session.');
  try {
    const { user, refreshToken } = await rotateSession(token, sessionMeta(req));
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken: signAccessToken(user), user: toPublicUser(user) });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

authRouter.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeSessionByToken(token);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});
