import { isValidObjectId } from 'mongoose';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { githubRateLimit } from '../integrations/github';
import { getLlmProvider } from '../integrations/llm';
import { ActivityLog, UsageCounter } from '../models/Activity';
import { AlertRule, Notification } from '../models/Alerts';
import { Bookmark } from '../models/Personal';
import { Repository } from '../models/Repository';
import { User, toPublicUser, type UserDoc } from '../models/User';
import { flushUsage, logActivity } from './activity.service';
import { runAlertEvaluation } from './alerts.service';
import { revokeAllSessionsForUser } from './tokens';

const DAYS = 14;

/** Platform usage and upstream API consumption for the admin console (REQ-ADMIN-002). */
export async function getUsage() {
  await flushUsage();
  const dates = Array.from({ length: DAYS }, (_, i) => new Date(Date.now() - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const counters = await UsageCounter.find({ date: { $gte: dates[0] } }).lean();
  const series = dates.map((date) => ({
    date,
    ...Object.fromEntries(counters.filter((c) => c.date === date).map((c) => [c.key, c.count])),
  })) as ({ date: string } & Record<string, number>)[];
  const today = series.at(-1)!;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [users, admins, deactivated, activeThisWeek, repositories, bookmarks, alerts, notifications] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ status: 'deactivated' }),
    User.countDocuments({ lastLoginAt: { $gte: weekAgo } }),
    Repository.countDocuments(),
    Bookmark.countDocuments(),
    AlertRule.countDocuments({ active: true }),
    Notification.countDocuments(),
  ]);

  const provider = getLlmProvider();
  return {
    platform: { users, admins, deactivated, activeThisWeek, repositories, bookmarks, activeAlerts: alerts, notifications },
    today: {
      apiRequests: today['api.requests'] ?? 0,
      searches: today['repo.searches'] ?? 0,
      logins: today['auth.logins'] ?? 0,
      exports: today.exports ?? 0,
    },
    github: {
      authenticated: Boolean(config.githubToken),
      limit: githubRateLimit.limit,
      remaining: githubRateLimit.remaining,
      resetAt: githubRateLimit.resetAt,
      callsToday: today['github.calls'] ?? 0,
      errorsToday: today['github.errors'] ?? 0,
    },
    llm: {
      configured: Boolean(provider),
      model: provider?.model ?? null,
      callsToday: today['llm.calls'] ?? 0,
      failuresToday: today['llm.failures'] ?? 0,
    },
    alertIntervalMinutes: config.alertIntervalMinutes,
    series,
  };
}

export async function listUsers() {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  return users.map(toPublicUser);
}

/** Deactivate or reactivate an account (REQ-ADMIN-003). Deactivation ends all of the user's sessions. */
export async function setUserStatus(admin: UserDoc, id: string, status: 'active' | 'deactivated', ip?: string) {
  if (!isValidObjectId(id)) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  if (String(admin._id) === id) throw new HttpError(400, 'CANNOT_CHANGE_SELF', 'You cannot deactivate your own account.');
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  if (user.status === status) return toPublicUser(user);

  user.status = status;
  await user.save();
  if (status === 'deactivated') await revokeAllSessionsForUser(user._id);
  await logActivity({
    actor: admin,
    action: status === 'deactivated' ? 'admin.user.deactivate' : 'admin.user.reactivate',
    target: { type: 'user', id: String(user._id), label: user.email },
    ip,
  });
  return toPublicUser(user);
}

export async function listActivity(limit: number, before?: Date, action?: string) {
  const filter: Record<string, unknown> = {};
  if (before) filter.createdAt = { $lt: before };
  if (action) filter.action = { $regex: `^${action.replace(/[^a-z.]/gi, '')}` };
  const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
  return {
    hasMore: logs.length > limit,
    logs: logs.slice(0, limit).map((l) => ({
      id: String(l._id),
      action: l.action,
      actorEmail: l.actorEmail,
      targetType: l.targetType,
      targetLabel: l.targetLabel,
      details: l.details,
      ip: l.ip,
      createdAt: l.createdAt,
    })),
  };
}

export async function runAlertsNow(admin: UserDoc, ip?: string) {
  const result = await runAlertEvaluation();
  await logActivity({ actor: admin, action: 'admin.alerts.run', details: result, ip });
  return result;
}
