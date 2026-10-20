import { isValidObjectId, type Types } from 'mongoose';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { githubFetch, githubGet, type GitHubRepo } from '../integrations/github';
import { AlertRule, JobLock, Notification, type AlertType } from '../models/Alerts';
import { Repository, type RepositoryMetadata } from '../models/Repository';
import { track } from './activity.service';

const MAX_RULES_PER_USER = 50;
const LOCK_NAME = 'alert-evaluation';
const LOCK_MS = 10 * 60_000;

type Rule = InstanceType<typeof AlertRule>;

const notFound = () => new HttpError(404, 'REPO_NOT_FOUND', 'This repository no longer exists on GitHub or is no longer public.');
const isDuplicateKey = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

export function toPublicRule(rule: Rule, currentStars?: number) {
  return {
    id: String(rule._id),
    githubId: rule.githubId,
    fullName: rule.fullName,
    type: rule.type as AlertType,
    threshold: rule.threshold,
    active: rule.active,
    triggered: rule.state?.triggered ?? false,
    lastStars: currentStars ?? rule.state?.lastStars ?? null,
    lastReleaseTag: rule.state?.lastReleaseTag ?? null,
    lastCheckedAt: rule.lastCheckedAt,
    lastError: rule.lastError,
    createdAt: rule.createdAt,
  };
}

async function latestReleaseTag(githubId: number): Promise<string | null> {
  try {
    const res = await githubFetch(`/repositories/${githubId}/releases/latest`, new HttpError(404, 'NO_RELEASE', 'No release'));
    return ((await res.json()) as { tag_name: string }).tag_name;
  } catch (err) {
    if (err instanceof HttpError && err.code === 'NO_RELEASE') return null;
    throw err;
  }
}

/** Create a notification once per dedupe key; repeats (e.g. a retried job) are ignored. */
async function notify(rule: Rule, dedupeKey: string, title: string, body: string): Promise<boolean> {
  const res = await Notification.updateOne(
    { userId: rule.userId, dedupeKey },
    { $setOnInsert: { ruleId: rule._id, kind: rule.type, title, body, link: `/${rule.fullName}` } },
    { upsert: true },
  );
  if (res.upsertedCount) track('alerts.notifications');
  return res.upsertedCount > 0;
}

/** Evaluate one rule against fresh GitHub data. Returns true when it fired. */
async function evaluateRule(rule: Rule, repo: { stars: number; releaseTag: () => Promise<string | null> }): Promise<boolean> {
  // Nested defaults are always populated by the schema.
  const state = rule.state!;
  let fired = false;
  if (rule.type === 'star_threshold' && rule.threshold !== null && rule.threshold !== undefined) {
    const reached = repo.stars >= rule.threshold;
    if (reached && !state.triggered) {
      const episode = state.triggerCount + 1;
      fired = await notify(
        rule,
        `${rule._id}:stars:${episode}`,
        `${rule.fullName} reached ${rule.threshold.toLocaleString('en')} stars`,
        `It now has ${repo.stars.toLocaleString('en')} stars.`,
      );
      state.triggered = true;
      state.triggerCount = episode;
    } else if (!reached && state.triggered) {
      // Dropped back below the line: re-arm so the next crossing notifies again.
      state.triggered = false;
    }
    state.lastStars = repo.stars;
  }

  if (rule.type === 'new_release') {
    const tag = await repo.releaseTag();
    if (tag && state.lastReleaseTag && tag !== state.lastReleaseTag) {
      fired = await notify(rule, `${rule._id}:release:${tag}`, `New release of ${rule.fullName}: ${tag}`, `${rule.fullName} published ${tag}.`);
    }
    if (tag) state.lastReleaseTag = tag;
  }

  rule.lastCheckedAt = new Date();
  rule.lastError = null;
  await rule.save();
  return fired;
}

/** Fetch fresh data once per repository and evaluate every rule watching it. */
async function evaluateRules(rules: Rule[]) {
  const summary = { repositories: 0, rules: rules.length, fired: 0, errors: 0 };
  const byRepo = new Map<number, Rule[]>();
  for (const r of rules) byRepo.set(r.githubId, [...(byRepo.get(r.githubId) ?? []), r]);

  for (const [githubId, repoRules] of byRepo) {
    summary.repositories++;
    try {
      const gh = await githubGet<GitHubRepo>(`/repositories/${githubId}`, notFound());
      let tag: Promise<string | null> | undefined;
      const repo = { stars: gh.stargazers_count, releaseTag: () => (tag ??= latestReleaseTag(githubId)) };
      for (const rule of repoRules) if (await evaluateRule(rule, repo)) summary.fired++;
    } catch (err) {
      summary.errors += repoRules.length;
      const message = err instanceof Error ? err.message : String(err);
      await AlertRule.updateMany({ _id: { $in: repoRules.map((r) => r._id) } }, { $set: { lastCheckedAt: new Date(), lastError: message } });
    }
  }
  return summary;
}

/** Periodic job (REQ-PERS-005): evaluate all active rules, holding a lease so processes never overlap. */
export async function runAlertEvaluation() {
  const now = new Date();
  try {
    await JobLock.findOneAndUpdate(
      { name: LOCK_NAME, lockedUntil: { $lt: now } },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
      { upsert: true },
    );
  } catch (err) {
    // Another process holds the lease (the upsert collides with the existing locked document).
    if (isDuplicateKey(err)) return { skipped: true as const };
    throw err;
  }
  try {
    const rules = await AlertRule.find({ active: true });
    return { skipped: false as const, ...(await evaluateRules(rules)) };
  } finally {
    await JobLock.updateOne({ name: LOCK_NAME }, { $set: { lockedUntil: new Date(0) } });
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startAlertScheduler(): void {
  if (timer) return;
  const minutes = config.alertIntervalMinutes;
  timer = setInterval(() => {
    runAlertEvaluation()
      .then((s) => !s.skipped && s.rules && console.log(`Alert check: ${s.rules} rule(s), ${s.fired} notification(s), ${s.errors} error(s)`))
      .catch((err) => console.error('Alert evaluation failed:', err));
  }, minutes * 60_000);
  timer.unref();
  console.log(`Alert scheduler running every ${minutes} minute(s)`);
}

// ---- Rule management (REQ-PERS-004) ----

export async function listRules(userId: Types.ObjectId) {
  const rules = await AlertRule.find({ userId }).sort({ createdAt: -1 });
  return rules.map((r) => toPublicRule(r));
}

export async function createRule(userId: Types.ObjectId, input: { githubId: number; type: AlertType; threshold?: number }) {
  const repo = await Repository.findOne({ githubId: input.githubId }).select('metadata').lean();
  if (!repo) throw new HttpError(404, 'REPO_NOT_FOUND', 'Search for this repository before creating an alert.');
  const meta = repo.metadata as RepositoryMetadata;
  if (input.type === 'star_threshold' && !input.threshold) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a star count for this alert.');
  if ((await AlertRule.countDocuments({ userId })) >= MAX_RULES_PER_USER) {
    throw new HttpError(400, 'TOO_MANY_ALERTS', `You can have up to ${MAX_RULES_PER_USER} alerts.`);
  }

  let rule: Rule;
  try {
    rule = await AlertRule.create({
      userId,
      githubId: meta.id,
      fullName: meta.fullName,
      type: input.type,
      threshold: input.type === 'star_threshold' ? input.threshold : null,
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'ALERT_EXISTS', 'You already have this alert for this repository.');
    throw err;
  }

  // Check straight away: records the release baseline, and a threshold that is already met notifies now.
  await evaluateRules([rule]).catch(() => undefined);
  return toPublicRule(await AlertRule.findById(rule._id).orFail());
}

export async function updateRule(userId: Types.ObjectId, id: string, changes: { active?: boolean; threshold?: number }) {
  if (!isValidObjectId(id)) throw new HttpError(404, 'NOT_FOUND', 'Alert not found.');
  const rule = await AlertRule.findOne({ _id: id, userId });
  if (!rule) throw new HttpError(404, 'NOT_FOUND', 'Alert not found.');
  if (changes.active !== undefined) rule.active = changes.active;
  if (changes.threshold !== undefined && rule.type === 'star_threshold') {
    rule.threshold = changes.threshold;
    rule.state!.triggered = false;
  }
  await rule.save();
  return toPublicRule(rule);
}

export async function deleteRule(userId: Types.ObjectId, id: string) {
  if (!isValidObjectId(id) || !(await AlertRule.findOneAndDelete({ _id: id, userId }))) throw new HttpError(404, 'NOT_FOUND', 'Alert not found.');
}

// ---- Notifications (REQ-PERS-006) ----

export async function listNotifications(userId: Types.ObjectId, limit = 30) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  return {
    unread,
    notifications: items.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), createdAt: n.createdAt })),
  };
}

export async function unreadCount(userId: Types.ObjectId) {
  return Notification.countDocuments({ userId, readAt: null });
}

export async function markRead(userId: Types.ObjectId, id?: string) {
  if (id && !isValidObjectId(id)) throw new HttpError(404, 'NOT_FOUND', 'Notification not found.');
  await Notification.updateMany({ userId, readAt: null, ...(id ? { _id: id } : {}) }, { $set: { readAt: new Date() } });
}

export async function clearNotifications(userId: Types.ObjectId) {
  await Notification.deleteMany({ userId });
}
