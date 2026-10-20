import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { User, type Role, type UserDoc } from '../models/User';
import { isBlockedDemoAccount } from '../seed';
import { revokeAllSessionsForUser } from './tokens';

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

/**
 * ADMIN_EMAILS only applies to Google sign-ins: Google has verified the person owns that address.
 * Password sign-ups never verify the email, so anyone could otherwise register an admin's address first.
 */
const isAdminEmail = (email: string) => config.adminEmails.includes(email);

export async function registerWithPassword(input: { email: string; password: string; name?: string }): Promise<UserDoc> {
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  return User.create({ email: input.email, name: input.name ?? '', passwordHash, hasPassword: true, role: 'user' as Role });
}

export async function loginWithPassword(email: string, password: string): Promise<UserDoc> {
  // The seeded demo accounts have public passwords; refuse them where that would be a real risk.
  if (isBlockedDemoAccount(email)) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalidCredentials();
  }
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
  let linkedOverPassword = false;
  if (user) {
    if (!user.googleId) {
      user.googleId = payload.sub;
      // Google proves this person owns the address, but anyone could have registered it with a password
      // (sign-up doesn't verify email). Remove that password so a squatter can't keep sharing the account.
      linkedOverPassword = user.hasPassword;
      user.hasPassword = false;
    }
  } else {
    user = new User({ email, name: payload.name ?? '', googleId: payload.sub });
  }
  if (isAdminEmail(email)) user.role = 'admin';
  if (user.status !== 'active') throw deactivated();
  user.lastLoginAt = new Date();
  await user.save();
  if (linkedOverPassword) {
    await User.updateOne({ _id: user._id }, { $unset: { passwordHash: 1 } });
    await revokeAllSessionsForUser(user._id);
  }
  return user;
}
