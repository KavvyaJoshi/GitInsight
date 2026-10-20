import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { User, type Role, type UserDoc } from '../models/User';

const googleClient = new OAuth2Client();
// Compared against when the email is unknown so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', config.bcryptRounds);

const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
const deactivated = () => new HttpError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.');

function accountLocked(lockUntil: Date) {
  const minutes = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 60_000));
  return new HttpError(
    423,
    'ACCOUNT_LOCKED',
    `Too many failed login attempts. Your account is locked for ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    { lockedUntil: lockUntil.toISOString() },
  );
}

function roleForEmail(email: string): Role {
  return config.adminEmails.includes(email) ? 'admin' : 'user';
}

export async function registerWithPassword(input: { email: string; password: string; name?: string }): Promise<UserDoc> {
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  return User.create({ email: input.email, name: input.name ?? '', passwordHash, role: roleForEmail(input.email) });
}

export async function loginWithPassword(email: string, password: string): Promise<UserDoc> {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalidCredentials();
  }
  if (user.lockUntil && user.lockUntil > new Date()) throw accountLocked(user.lockUntil);
  if (!user.passwordHash) {
    throw new HttpError(400, 'USE_GOOGLE_SIGN_IN', 'This account signs in with Google. Use "Continue with Google".');
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const updated = await User.findByIdAndUpdate(user._id, { $inc: { failedLoginCount: 1 } }, { returnDocument: 'after' });
    if (updated && updated.failedLoginCount >= config.maxFailedLogins) {
      const lockUntil = new Date(Date.now() + config.lockoutMinutes * 60_000);
      await User.updateOne({ _id: user._id }, { $set: { lockUntil, failedLoginCount: 0 } });
      throw accountLocked(lockUntil);
    }
    throw invalidCredentials();
  }

  if (user.status !== 'active') throw deactivated();
  user.failedLoginCount = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function loginWithGoogle(credential: string): Promise<UserDoc> {
  if (!config.googleClientId) {
    throw new HttpError(501, 'GOOGLE_DISABLED', 'Google sign-in is not configured on this server.');
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in failed. Please try again.');
  }
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Your Google account email is not verified.');
  }

  const email = payload.email.toLowerCase();
  let user = (await User.findOne({ googleId: payload.sub })) ?? (await User.findOne({ email }));
  if (user) {
    user.googleId ??= payload.sub;
  } else {
    user = new User({ email, name: payload.name ?? '', googleId: payload.sub, role: roleForEmail(email) });
  }
  if (user.status !== 'active') throw deactivated();
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}
