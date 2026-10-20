import type { Types } from 'mongoose';
import { config } from '../config';
import { ActivityLog, UsageCounter } from '../models/Activity';

export type UsageKey =
  | 'api.requests'
  | 'repo.searches'
  | 'github.calls'
  | 'github.errors'
  | 'llm.calls'
  | 'llm.failures'
  | 'auth.logins'
  | 'auth.registrations'
  | 'exports'
  | 'alerts.notifications';

const today = () => new Date().toISOString().slice(0, 10);

// Counts are buffered in memory and flushed in batches so tracking never slows a request down.
let pending = new Map<string, number>();

export function track(key: UsageKey, amount = 1): void {
  const id = `${today()}|${key}`;
  pending.set(id, (pending.get(id) ?? 0) + amount);
}

export async function flushUsage(): Promise<void> {
  if (!pending.size) return;
  const batch = pending;
  pending = new Map();
  await UsageCounter.bulkWrite(
    [...batch].map(([id, count]) => {
      const [date, key] = id.split('|');
      return { updateOne: { filter: { date, key }, update: { $inc: { count } }, upsert: true } };
    }),
  ).catch((err) => console.error('Failed to flush usage counters:', err));
}

if (!config.isTest) setInterval(flushUsage, 10_000).unref();

export interface ActivityInput {
  actor?: { _id: Types.ObjectId; email: string } | null;
  action: string;
  target?: { type: string; id: string; label?: string };
  details?: Record<string, unknown>;
  ip?: string;
}

/** Record a system or administrator event. Failures are logged, never thrown. */
export async function logActivity({ actor, action, target, details, ip }: ActivityInput): Promise<void> {
  await ActivityLog.create({
    actorId: actor?._id ?? null,
    actorEmail: actor?.email ?? null,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    targetLabel: target?.label ?? null,
    details: details ?? null,
    ip: ip ?? null,
  }).catch((err) => console.error('Failed to write activity log:', err));
}
