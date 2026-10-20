import { HttpError } from '../lib/errors';
import { Repository, type RepositoryMetadata } from '../models/Repository';
import {
  StatsPendingError,
  getActivity,
  getContributors,
  getMaintenance,
  getPopularity,
  type Activity,
  type AnalyticsResult,
} from './analytics.service';

export const HEALTH_FORMULA_VERSION = '1.0';

type Contributors = Awaited<ReturnType<typeof getContributors>>['data'];
type Maintenance = Awaited<ReturnType<typeof getMaintenance>>['data'];
type Popularity = Awaited<ReturnType<typeof getPopularity>>['data'];

export interface HealthComponent {
  key: 'activity' | 'community' | 'maintenance' | 'popularity';
  label: string;
  score: number | null;
  /** Plain-language facts the score was computed from. */
  basis: string[];
  /** Why the score is unavailable, when it is. */
  reason?: string;
}

export interface HealthInputs {
  activity?: Activity | Error;
  contributors?: Contributors | Error;
  maintenance?: Maintenance | Error;
  popularity?: Popularity | Error;
  archived: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0 at zero, 1 at `full`, logarithmic in between so small projects are not flattened to zero. */
const logScale = (value: number, full: number) => clamp01(Math.log10(1 + value) / Math.log10(1 + full));
const unavailable = (key: HealthComponent['key'], label: string, reason: string): HealthComponent => ({ key, label, score: null, basis: [], reason });
const plural = (n: number, word: string) => `${n.toLocaleString('en')} ${word}${n === 1 ? '' : 's'}`;

/** Activity: weeks with commits out of the last 12, plus commit volume over the last 90 days. */
function activityScore(a: Activity): HealthComponent {
  const last84 = a.days.slice(-84);
  const activeWeeks = Array.from({ length: 12 }, (_, w) => last84.slice(w * 7, w * 7 + 7)).filter((week) => week.some((d) => d.count > 0)).length;
  const commits90 = a.days.slice(-90).reduce((sum, d) => sum + d.count, 0);
  return {
    key: 'activity',
    label: 'Activity',
    score: Math.round(50 * (activeWeeks / 12) + 50 * logScale(commits90, 150)),
    basis: [`Commits in ${activeWeeks} of the last 12 weeks`, `${plural(commits90, 'commit')} in the last 90 days`],
  };
}

/** Community: how many people contribute, and how evenly work is shared among the top contributors (bots excluded). */
function communityScore(c: Contributors): HealthComponent {
  const humans = c.contributors.filter((p) => !p.isBot);
  if (!humans.length) return unavailable('community', 'Community', 'No human contributors were found.');
  const commits = humans.reduce((sum, p) => sum + p.commits, 0);
  const topShare = commits ? humans[0].commits / commits : 1;
  // 10% for the top person means work is spread evenly across ten people; 100% means one person does everything.
  const spread = clamp01(1 - (topShare - 0.1) / 0.9);
  return {
    key: 'community',
    label: 'Community',
    score: Math.round(50 * logScale(c.totalContributors, 100) + 50 * spread),
    basis: [`${plural(c.totalContributors, 'contributor')} in total`, `Top contributor made ${Math.round(topShare * 100)}% of the top-ten commits`],
  };
}

/** Maintenance: share of recent issues and PRs that got a response, and how quickly they close. */
function maintenanceScore(m: Maintenance, archived: boolean): HealthComponent {
  if (archived) return { key: 'maintenance', label: 'Maintenance', score: 0, basis: ['The repository is archived, so it is no longer maintained'] };
  if (m.sampled < 5) return unavailable('maintenance', 'Maintenance', 'Fewer than five recent issues or pull requests to measure.');
  const responseRate = m.responded / m.sampled;
  // Closing within a week scores full marks; 90 days or more scores none.
  const speed = m.medianCloseDays === null ? 0 : clamp01(1 - Math.log10(Math.max(m.medianCloseDays, 7) / 7) / Math.log10(90 / 7));
  return {
    key: 'maintenance',
    label: 'Maintenance',
    score: Math.round(60 * responseRate + 40 * speed),
    basis: [
      `${Math.round(responseRate * 100)}% of the last ${m.sampled} issues and pull requests got a response`,
      m.medianCloseDays === null ? 'None of them have been closed yet' : `Median time to close: ${m.medianCloseDays} days`,
    ],
  };
}

/** Popularity: stars and forks gained over the last 30 days (growth, not lifetime totals). */
function popularityScore(p: Popularity): HealthComponent {
  if (p.starsGained === null) {
    return unavailable(
      'popularity',
      'Popularity',
      p.needsToken
        ? 'GitHub only shares star history with an API token. Add GITHUB_TOKEN on the server, or wait for a week of daily tracking.'
        : 'Star growth is still being collected. It becomes available after a week of daily tracking.',
    );
  }
  return {
    key: 'popularity',
    label: 'Popularity',
    score: Math.round(70 * logScale(p.starsGained, 1000) + 30 * logScale(p.forksGained, 100)),
    basis: [
      `${plural(p.starsGained, 'new star')} in the last ${p.windowDays} days${p.starsSource === 'snapshots' ? ' (estimated from daily tracking)' : ''}`,
      `${p.forksCapped ? '100+ new forks' : plural(p.forksGained, 'new fork')} in the last ${p.windowDays} days`,
    ],
  };
}

const failed = (key: HealthComponent['key'], label: string, err: Error) => unavailable(key, label, `Couldn’t load the data: ${err.message}`);

/** Combine the four sub-scores with equal weights, renormalised over the ones available. */
export function computeHealth(inputs: HealthInputs) {
  const pick = <T>(value: T | Error | undefined, key: HealthComponent['key'], label: string, score: (v: T) => HealthComponent) =>
    value instanceof Error ? failed(key, label, value) : value === undefined ? unavailable(key, label, 'No data.') : score(value);

  const components: HealthComponent[] = [
    pick(inputs.activity, 'activity', 'Activity', activityScore),
    pick(inputs.contributors, 'community', 'Community', communityScore),
    pick(inputs.maintenance, 'maintenance', 'Maintenance', (m) => maintenanceScore(m, inputs.archived)),
    pick(inputs.popularity, 'popularity', 'Popularity', popularityScore),
  ];
  const available = components.filter((c) => c.score !== null);
  // With fewer than two sub-scores a single number would be misleading.
  const score = available.length >= 2 ? Math.round(available.reduce((sum, c) => sum + c.score!, 0) / available.length) : null;
  const grade = score === null ? null : score >= 80 ? 'Thriving' : score >= 60 ? 'Healthy' : score >= 40 ? 'Needs attention' : 'At risk';

  return {
    score,
    grade,
    formulaVersion: HEALTH_FORMULA_VERSION,
    availableComponents: available.length,
    explanation:
      score === null
        ? `Only ${available.length} of the four signals could be measured for this repository, so an overall score would be misleading.`
        : available.length < 4
          ? `Averaged over the ${available.length} signals that could be measured.`
          : 'Equal-weight average of all four signals.',
    components,
  };
}

async function settle<T>(work: Promise<AnalyticsResult<T>>): Promise<AnalyticsResult<T> | Error> {
  try {
    return await work;
  } catch (err) {
    // Commit statistics still computing: the whole score waits rather than showing a partial number.
    if (err instanceof StatsPendingError) throw err;
    return err instanceof Error ? err : new Error(String(err));
  }
}

/** Health is recomputed from the cached analytics on every request, so it refreshes whenever they do (REQ-HEALTH-005). */
export async function getHealthScore(githubId: number) {
  const repo = await Repository.findOne({ githubId }).select('metadata').lean();
  if (!repo) throw new HttpError(404, 'REPO_NOT_FOUND', 'Search for this repository before requesting its analytics.');

  const [activity, contributors, maintenance, popularity] = await Promise.all([
    settle(getActivity(githubId)),
    settle(getContributors(githubId)),
    settle(getMaintenance(githubId)),
    settle(getPopularity(githubId)),
  ]);
  const results = [activity, contributors, maintenance, popularity].flatMap((r) => (r instanceof Error ? [] : [{ computedAt: r.computedAt, stale: r.stale }]));
  const data = <T>(r: AnalyticsResult<T> | Error) => (r instanceof Error ? r : r.data);

  return {
    status: 'ready' as const,
    data: computeHealth({
      activity: data(activity),
      contributors: data(contributors),
      maintenance: data(maintenance),
      popularity: data(popularity),
      archived: (repo.metadata as RepositoryMetadata).archived,
    }),
    computedAt: results.map((r) => r.computedAt).sort().at(-1) ?? new Date().toISOString(),
    stale: results.some((r) => r.stale),
  };
}
