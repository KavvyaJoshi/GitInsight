import { config } from '../config';
import { HttpError } from '../lib/errors';
import { githubFetch, lastPageFromLink } from '../integrations/github';
import { Repository, RepositoryDailySnapshot, type RepositoryMetadata } from '../models/Repository';

export interface AnalyticsResult<T> {
  status: 'ready';
  data: T;
  computedAt: string;
  /** True when GitHub failed and the last computed copy is returned instead. */
  stale: boolean;
}

/** GitHub is still computing statistics; the client should poll again. */
export class StatsPendingError extends Error {
  retryAfter = 5;
}

const DAY_MS = 86_400_000;
const BRANCHES_PER_PAGE = 50;
const MAX_LANGUAGE_SLICES = 8;
const FALLBACK_CODES = new Set(['RATE_LIMITED', 'GITHUB_UNAVAILABLE', 'GITHUB_ERROR']);

const notFound = () => new HttpError(404, 'REPO_NOT_FOUND', 'This repository no longer exists on GitHub or is no longer public.');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Concurrent requests for the same dataset share one GitHub computation.
const inFlight = new Map<string, Promise<{ data: unknown; computedAt: string }>>();

export async function cachedAnalytics<T>(githubId: number, kind: string, compute: (meta: RepositoryMetadata) => Promise<T>): Promise<AnalyticsResult<T>> {
  const doc = await Repository.findOne({ githubId }).select(`metadata analytics.${kind}`).lean();
  if (!doc) throw new HttpError(404, 'REPO_NOT_FOUND', 'Search for this repository before requesting its analytics.');

  const cached = (doc.analytics as Record<string, { data: T; computedAt: string }> | undefined)?.[kind];
  if (cached && Date.now() - Date.parse(cached.computedAt) < config.analyticsTtlSec * 1000) {
    return { status: 'ready', ...cached, stale: false };
  }

  const key = `${githubId}:${kind}`;
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      const data = await compute(doc.metadata as RepositoryMetadata);
      const computedAt = new Date().toISOString();
      await Repository.updateOne({ githubId }, { $set: { [`analytics.${kind}`]: { data, computedAt } } });
      return { data, computedAt };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }

  try {
    const fresh = await job;
    return { status: 'ready', data: fresh.data as T, computedAt: fresh.computedAt, stale: false };
  } catch (err) {
    const recoverable = err instanceof StatsPendingError || (err instanceof HttpError && FALLBACK_CODES.has(err.code));
    if (cached && recoverable) return { status: 'ready', ...cached, stale: true };
    throw err;
  }
}

/** Round shares to one decimal so they always add up to exactly 100 (largest-remainder method). */
export function percentagesSummingTo100(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return values.map(() => 0);
  const scaled = values.map((v) => (v / total) * 1000);
  const floored = scaled.map(Math.floor);
  let remaining = 1000 - floored.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - floored[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (remaining-- <= 0) break;
    floored[i] += 1;
  }
  return floored.map((v) => v / 10);
}

// ---- Languages (REQ-ANLY-001) ----

export function getLanguages(githubId: number) {
  return cachedAnalytics(githubId, 'languages', async () => {
    const res = await githubFetch(`/repositories/${githubId}/languages`, notFound());
    const bytes = (await res.json()) as Record<string, number>;
    const sorted = Object.entries(bytes).sort((a, b) => b[1] - a[1]);
    // Past eight slices, the long tail folds into "Other" so every slice keeps a distinct colour.
    const head = sorted.length > MAX_LANGUAGE_SLICES ? sorted.slice(0, MAX_LANGUAGE_SLICES - 1) : sorted;
    const tail = sorted.slice(head.length);
    const slices = tail.length ? [...head, ['Other', tail.reduce((sum, [, b]) => sum + b, 0)] as [string, number]] : head;
    const percents = percentagesSummingTo100(slices.map(([, b]) => b));
    return {
      totalBytes: sorted.reduce((sum, [, b]) => sum + b, 0),
      languageCount: sorted.length,
      languages: slices.map(([name, b], i) => ({ name, bytes: b, percent: percents[i] })),
    };
  });
}

// ---- Contributors (REQ-ANLY-002) ----

interface GitHubContributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
}

export function getContributors(githubId: number) {
  return cachedAnalytics(githubId, 'contributors', async () => {
    const res = await githubFetch(`/repositories/${githubId}/contributors?per_page=10`, notFound());
    const list = res.status === 204 ? [] : ((await res.json()) as GitHubContributor[]);
    // With per_page=1 the Link header's last page number is the total contributor count.
    let totalContributors = list.length;
    if (list.length === 10) {
      const countRes = await githubFetch(`/repositories/${githubId}/contributors?per_page=1`, notFound());
      totalContributors = lastPageFromLink(countRes.headers.get('link')) ?? list.length;
    }
    return {
      totalContributors,
      contributors: list
        .map((c) => ({ login: c.login, avatarUrl: c.avatar_url, url: c.html_url, commits: c.contributions, isBot: c.type === 'Bot' }))
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 10),
    };
  });
}

// ---- Commit activity: monthly trend, heatmap, weekday frequency (REQ-ANLY-003/005/006) ----

interface CommitWeek {
  week: number;
  total: number;
  days: number[];
}

async function fetchCommitActivity(githubId: number): Promise<CommitWeek[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await githubFetch(`/repositories/${githubId}/stats/commit_activity`, notFound());
    if (res.status === 204) return [];
    if (res.status !== 202) return (await res.json()) as CommitWeek[];
    // 202 means GitHub is still computing; it is not an empty repository.
    if (attempt < 3) await sleep(config.statsRetryDelayMs * attempt);
  }
  throw new StatsPendingError();
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * One rolling window for all three views: the 364 days (52 weeks) ending today, UTC,
 * default branch, as reported by GitHub. Every day, month and weekday is zero-filled.
 */
export function buildActivity(weeks: CommitWeek[], now = new Date()) {
  const counts = new Map<string, number>();
  for (const w of weeks) {
    w.days.forEach((count, i) => counts.set(utcDate(w.week * 1000 + i * DAY_MS), count));
  }

  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - 363 * DAY_MS;
  const days: { date: string; count: number }[] = [];
  for (let t = start; t <= end; t += DAY_MS) days.push({ date: utcDate(t), count: counts.get(utcDate(t)) ?? 0 });

  const monthly = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthly.set(d.toISOString().slice(0, 7), 0);
  }
  const weekday = new Array<number>(7).fill(0);
  for (const { date, count } of days) {
    const month = date.slice(0, 7);
    if (monthly.has(month)) monthly.set(month, monthly.get(month)! + count);
    weekday[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] += count; // Monday = 0
  }

  return {
    windowStart: days[0].date,
    windowEnd: days[days.length - 1].date,
    totalCommits: days.reduce((sum, d) => sum + d.count, 0),
    activeDays: days.filter((d) => d.count > 0).length,
    days,
    monthly: [...monthly].map(([month, commits]) => ({ month, commits })),
    weekday: WEEKDAYS.map((day, i) => ({ day, commits: weekday[i] })),
  };
}

export type Activity = ReturnType<typeof buildActivity>;

export const getActivity = (githubId: number) =>
  cachedAnalytics(githubId, 'activity', async () => buildActivity(await fetchCommitActivity(githubId)));

function pick<T, K extends keyof T>(result: AnalyticsResult<T>, keys: K[]): AnalyticsResult<Pick<T, K>> {
  const data = Object.fromEntries(keys.map((k) => [k, result.data[k]])) as Pick<T, K>;
  return { ...result, data };
}

const WINDOW: (keyof Activity)[] = ['windowStart', 'windowEnd', 'totalCommits'];
export const getCommitTrend = async (id: number) => pick(await getActivity(id), [...WINDOW, 'monthly']);
export const getHeatmap = async (id: number) => pick(await getActivity(id), [...WINDOW, 'activeDays', 'days']);
export const getFrequency = async (id: number) => pick(await getActivity(id), [...WINDOW, 'weekday']);

// ---- Pull requests vs issues (REQ-ANLY-004) ----

export function getPullsIssues(githubId: number) {
  return cachedAnalytics(githubId, 'pullsIssues', async (meta) => {
    // With per_page=1 the Link header's last page number equals the number of open PRs.
    const res = await githubFetch(`/repositories/${githubId}/pulls?state=open&per_page=1`, notFound());
    const firstPage = (await res.json()) as unknown[];
    const openPullRequests = lastPageFromLink(res.headers.get('link')) ?? firstPage.length;
    // GitHub's open_issues_count includes PRs; subtracting avoids double-counting them as issues.
    return { openPullRequests, openIssues: Math.max(0, meta.openIssues - openPullRequests) };
  });
}

// ---- Maintenance signals for the health score (REQ-HEALTH-003) ----

interface GitHubIssue {
  created_at: string;
  closed_at: string | null;
  comments: number;
  pull_request?: unknown;
  user: { type: string } | null;
}

/**
 * Responsiveness over the 50 most recently opened issues and pull requests. An item counts
 * as answered once it has a comment or is closed; items under two days old are skipped so
 * maintainers get a fair chance to respond. Bot-opened items are excluded.
 */
export function getMaintenance(githubId: number) {
  return cachedAnalytics(githubId, 'maintenance', async () => {
    const res = await githubFetch(`/repositories/${githubId}/issues?state=all&sort=created&direction=desc&per_page=50`, notFound());
    const items = (await res.json()) as GitHubIssue[];
    const now = Date.now();
    const eligible = items.filter((i) => now - Date.parse(i.created_at) >= 2 * DAY_MS && i.user?.type !== 'Bot');
    const closeDays = eligible
      .filter((i) => i.closed_at)
      .map((i) => (Date.parse(i.closed_at!) - Date.parse(i.created_at)) / DAY_MS)
      .sort((a, b) => a - b);
    return {
      sampled: eligible.length,
      responded: eligible.filter((i) => i.comments > 0 || i.closed_at).length,
      closed: closeDays.length,
      medianCloseDays: closeDays.length ? Math.round(closeDays[Math.floor(closeDays.length / 2)] * 10) / 10 : null,
    };
  });
}

// ---- Popularity growth for the health score (REQ-HEALTH-004) ----

const GROWTH_WINDOW_DAYS = 30;
// GitHub only pages through the first 40,000 stargazers, so newer stars are unreachable beyond that.
const STARGAZER_PAGE_LIMIT_STARS = 40_000;

/** Stargazers are listed oldest-first, so read backwards from the last page using star timestamps. */
async function recentStargazers(githubId: number, totalStars: number, cutoff: number): Promise<number> {
  let gained = 0;
  for (let page = Math.ceil(totalStars / 100), read = 0; page >= 1 && read < 5; page--, read++) {
    const res = await githubFetch(`/repositories/${githubId}/stargazers?per_page=100&page=${page}`, notFound(), 'application/vnd.github.star+json');
    const stars = (await res.json()) as { starred_at: string }[];
    const recent = stars.filter((s) => Date.parse(s.starred_at) >= cutoff).length;
    gained += recent;
    if (stars.length > 0 && recent < stars.length) break;
  }
  return gained;
}

/** Growth estimated from our own daily snapshots, once at least a week of history exists. */
async function starsFromSnapshots(githubId: number, currentStars: number): Promise<number | null> {
  const oldest = await RepositoryDailySnapshot.findOne({ githubId }).sort({ date: 1 }).lean();
  const ageDays = oldest ? (Date.now() - Date.parse(`${oldest.date}T00:00:00Z`)) / DAY_MS : 0;
  if (!oldest || ageDays < 7) return null;
  return Math.max(0, Math.round(((currentStars - oldest.stars) * GROWTH_WINDOW_DAYS) / ageDays));
}

export function getPopularity(githubId: number) {
  return cachedAnalytics(githubId, 'popularity', async (meta) => {
    const cutoff = Date.now() - GROWTH_WINDOW_DAYS * DAY_MS;

    // Forks can be listed newest-first directly.
    const forksRes = await githubFetch(`/repositories/${githubId}/forks?sort=newest&per_page=100`, notFound());
    const forks = (await forksRes.json()) as { created_at: string }[];
    const forksGained = forks.filter((f) => Date.parse(f.created_at) >= cutoff).length;

    let starsGained: number | null = null;
    let starsSource: 'stargazers' | 'snapshots' | null = null;
    let needsToken = false;
    if (meta.stars === 0) {
      starsGained = 0;
      starsSource = 'stargazers';
    } else if (meta.stars <= STARGAZER_PAGE_LIMIT_STARS) {
      try {
        starsGained = await recentStargazers(githubId, meta.stars, cutoff);
        starsSource = 'stargazers';
      } catch (err) {
        // GitHub only lists stargazers to authenticated callers; fall back to our snapshots.
        if (!(err instanceof HttpError && err.code === 'GITHUB_AUTH_REQUIRED')) throw err;
        needsToken = true;
      }
    }
    if (starsGained === null) {
      starsGained = await starsFromSnapshots(githubId, meta.stars);
      if (starsGained !== null) starsSource = 'snapshots';
    }

    return { windowDays: GROWTH_WINDOW_DAYS, starsGained, starsSource, needsToken, forksGained, forksCapped: forksGained === 100 };
  });
}

// ---- README for the AI summary ----

export function getReadme(githubId: number) {
  return cachedAnalytics(githubId, 'readme', async () => {
    try {
      const res = await githubFetch(`/repositories/${githubId}/readme`, new HttpError(404, 'NO_README', 'No README'));
      const body = (await res.json()) as { content: string; encoding: string };
      return { text: body.encoding === 'base64' ? Buffer.from(body.content, 'base64').toString('utf8') : body.content };
    } catch (err) {
      if (err instanceof HttpError && err.code === 'NO_README') return { text: '' };
      throw err;
    }
  });
}

// ---- Branches (REQ-ANLY-007) ----

export function getBranches(githubId: number, page: number) {
  return cachedAnalytics(githubId, `branches_p${page}`, async (meta) => {
    const res = await githubFetch(`/repositories/${githubId}/branches?per_page=${BRANCHES_PER_PAGE}&page=${page}`, notFound());
    const list = (await res.json()) as { name: string; protected: boolean }[];
    const last = lastPageFromLink(res.headers.get('link'));
    return {
      defaultBranch: meta.defaultBranch,
      page,
      perPage: BRANCHES_PER_PAGE,
      totalPages: last ?? Math.max(page, 1),
      branches: list.map((b) => ({ name: b.name, protected: b.protected, isDefault: b.name === meta.defaultBranch })),
    };
  });
}
