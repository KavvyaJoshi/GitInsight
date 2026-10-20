import { config } from '../config';
import { cache } from '../lib/cache';
import { HttpError } from '../lib/errors';
import { githubGet, type GitHubRepo } from '../integrations/github';
import { Repository, RepositoryDailySnapshot, type RepositoryMetadata } from '../models/Repository';

export interface RepositoryResult {
  repository: RepositoryMetadata;
  fetchedAt: string;
  /** cache: served from Redis/memory; github: fetched now; stale: GitHub failed, last stored copy returned. */
  source: 'cache' | 'github' | 'stale';
}

const cacheKey = (fullName: string) => `repo:meta:${fullName.toLowerCase()}`;

const notFound = (fullName: string) =>
  new HttpError(404, 'REPO_NOT_FOUND', `${fullName} could not be found. It may be private, renamed or deleted.`);

// Upstream outages where showing the last stored copy is better than an error.
const FALLBACK_CODES = new Set(['RATE_LIMITED', 'GITHUB_UNAVAILABLE', 'GITHUB_ERROR']);

function toMetadata(r: GitHubRepo): RepositoryMetadata {
  return {
    id: r.id,
    owner: { login: r.owner.login, avatarUrl: r.owner.avatar_url, type: r.owner.type, url: r.owner.html_url },
    name: r.name,
    fullName: r.full_name,
    description: r.description?.trim() || null,
    url: r.html_url,
    homepage: r.homepage?.trim() || null,
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.subscribers_count ?? null,
    openIssues: r.open_issues_count,
    language: r.language,
    license: r.license ? { spdxId: r.license.spdx_id === 'NOASSERTION' ? null : r.license.spdx_id, name: r.license.name } : null,
    sizeKb: r.size,
    topics: r.topics ?? [],
    defaultBranch: r.default_branch,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pushedAt: r.pushed_at,
    archived: r.archived,
    isFork: r.fork,
  };
}

async function recordDailySnapshot(meta: RepositoryMetadata): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  await RepositoryDailySnapshot.updateOne(
    { githubId: meta.id, date },
    { $set: { stars: meta.stars, forks: meta.forks } },
    { upsert: true },
  );
}

export async function resolveRepository(owner: string, repo: string): Promise<RepositoryResult> {
  const requested = `${owner}/${repo}`;
  const cached = await cache.get<Omit<RepositoryResult, 'source'>>(cacheKey(requested));
  if (cached) return { ...cached, source: 'cache' };

  let gh: GitHubRepo;
  try {
    gh = await githubGet<GitHubRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, notFound(requested));
  } catch (err) {
    if (err instanceof HttpError && FALLBACK_CODES.has(err.code)) {
      const stored = await Repository.findOne({ fullNameLower: requested.toLowerCase() });
      if (stored) return { repository: stored.metadata, fetchedAt: stored.fetchedAt.toISOString(), source: 'stale' };
    }
    throw err;
  }
  // Only reachable with a token that can see private repositories; Version 1.0 is public-only.
  if (gh.private) throw notFound(requested);

  const repository = toMetadata(gh);
  const fetchedAt = new Date();
  await Repository.updateOne(
    { githubId: gh.id },
    { $set: { fullName: gh.full_name, fullNameLower: gh.full_name.toLowerCase(), metadata: repository, fetchedAt } },
    { upsert: true },
  );
  await recordDailySnapshot(repository);

  const entry = { repository, fetchedAt: fetchedAt.toISOString() };
  await cache.set(cacheKey(requested), entry, config.metadataTtlSec);
  // GitHub follows renames, so also cache under the canonical name.
  if (gh.full_name.toLowerCase() !== requested.toLowerCase()) await cache.set(cacheKey(gh.full_name), entry, config.metadataTtlSec);
  return { ...entry, source: 'github' };
}

export async function getRepositoryById(githubId: number): Promise<RepositoryResult> {
  const stored = await Repository.findOne({ githubId });
  if (!stored) throw new HttpError(404, 'REPO_NOT_FOUND', 'This repository has not been searched yet.');
  return { repository: stored.metadata, fetchedAt: stored.fetchedAt.toISOString(), source: 'cache' };
}
