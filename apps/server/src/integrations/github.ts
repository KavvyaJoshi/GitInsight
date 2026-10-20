import { config } from '../config';
import { HttpError } from '../lib/errors';

const API = 'https://api.github.com';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string; type: string; html_url: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  subscribers_count?: number;
  open_issues_count: number;
  language: string | null;
  license: { spdx_id: string | null; name: string } | null;
  size: number;
  topics?: string[];
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
  private: boolean;
}

/** Latest rate-limit headers seen from GitHub, for the admin panel and error messages. */
export const githubRateLimit = {
  limit: null as number | null,
  remaining: null as number | null,
  resetAt: null as string | null,
};

function recordRateLimit(res: Response): string | null {
  const limit = res.headers.get('x-ratelimit-limit');
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (limit) githubRateLimit.limit = Number(limit);
  if (remaining) githubRateLimit.remaining = Number(remaining);
  if (reset) githubRateLimit.resetAt = new Date(Number(reset) * 1000).toISOString();

  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) return new Date(Date.now() + Number(retryAfter) * 1000).toISOString();
  return reset ? githubRateLimit.resetAt : null;
}

/** Number of the last page from a GitHub Link header, or null when there is only one page. */
export function lastPageFromLink(link: string | null): number | null {
  const match = link?.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return match ? Number(match[1]) : null;
}

/** GET a GitHub REST path and parse the JSON body. */
export async function githubGet<T>(path: string, notFound: HttpError): Promise<T> {
  const res = await githubFetch(path, notFound);
  return (await res.json()) as T;
}

/**
 * GET a GitHub REST path, translating failures into user-facing errors. Successful
 * responses (including 202 "still computing" and 204 "no content") are returned as-is.
 */
export async function githubFetch(path: string, notFound: HttpError, accept = 'application/vnd.github+json'): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GitInsight',
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(config.githubTimeoutMs) });
  } catch {
    throw new HttpError(502, 'GITHUB_UNAVAILABLE', 'GitHub could not be reached. Please try again in a moment.');
  }

  const resetAt = recordRateLimit(res);
  if (res.ok) return res;
  if (res.status === 404) throw notFound;
  if (res.status === 401) throw new HttpError(502, 'GITHUB_AUTH_REQUIRED', 'GitHub requires an API token for this data.');
  if (res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')))) {
    throw new HttpError(429, 'RATE_LIMITED', 'GitHub’s API rate limit has been reached. Please try again later.', { resetAt });
  }
  if (res.status === 403 || res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (/too large/i.test(body.message ?? '')) {
      throw new HttpError(422, 'TOO_LARGE', 'GitHub doesn’t provide this data through its API for a repository this large.');
    }
  }
  if (res.status === 403 || res.status === 451) {
    throw new HttpError(403, 'REPO_UNAVAILABLE', 'GitHub is not allowing access to this repository.');
  }
  throw new HttpError(502, 'GITHUB_ERROR', 'GitHub returned an unexpected error. Please try again.');
}
