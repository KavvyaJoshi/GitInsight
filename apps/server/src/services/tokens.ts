import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { isValidObjectId, type Types } from 'mongoose';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { Session } from '../models/Session';
import { User, type Role, type UserDoc } from '../models/User';
import { isBlockedDemoAccount } from '../seed';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

const invalidSession = () => new HttpError(401, 'INVALID_SESSION', 'Your session has expired. Please log in again.');

export function signAccessToken(user: UserDoc): string {
  return jwt.sign({ role: user.role }, config.jwtAccessSecret, {
    subject: user.id,
    expiresIn: config.accessTokenTtlSec,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): { sub: string; role: Role } {
  const payload = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  if (!payload.sub) throw new Error('Token has no subject');
  return { sub: payload.sub, role: payload.role };
}

export async function createSession(userId: Types.ObjectId, meta: SessionMeta, familyId: string = crypto.randomUUID()) {
  const secret = crypto.randomBytes(32).toString('base64url');
  const session = await Session.create({
    userId,
    familyId,
    tokenHash: sha256(secret),
    expiresAt: new Date(Date.now() + config.refreshTokenTtlSec * 1000),
    ...meta,
  });
  return { session, refreshToken: `${session.id}.${secret}` };
}

async function findSessionByToken(refreshToken: string) {
  const [id, secret] = refreshToken.split('.');
  if (!id || !secret || !isValidObjectId(id)) return null;
  const session = await Session.findById(id);
  if (!session || !safeEqual(sha256(secret), session.tokenHash)) return null;
  return session;
}

export async function revokeFamily(familyId: string): Promise<void> {
  await Session.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessionsForUser(userId: Types.ObjectId): Promise<void> {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function rotateSession(refreshToken: string, meta: SessionMeta) {
  const session = await findSessionByToken(refreshToken);
  if (!session || session.expiresAt <= new Date()) throw invalidSession();

  // Claim the token atomically so two concurrent refreshes cannot both succeed.
  const claimed = await Session.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (!claimed) {
    // A token that was already rotated is being replayed: assume theft and end the whole family.
    await revokeFamily(session.familyId);
    throw new HttpError(401, 'REFRESH_TOKEN_REUSED', 'This session was ended for your security. Please log in again.');
  }

  const user = await User.findById(session.userId);
  if (!user || user.status !== 'active' || isBlockedDemoAccount(user.email)) {
    await revokeFamily(session.familyId);
    throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.');
  }

  const next = await createSession(user._id, meta, session.familyId);
  await Session.updateOne({ _id: session._id }, { $set: { replacedBy: next.session._id } });
  return { user, refreshToken: next.refreshToken };
}

export async function revokeSessionByToken(refreshToken: string): Promise<void> {
  const session = await findSessionByToken(refreshToken);
  if (session) await revokeFamily(session.familyId);
}
