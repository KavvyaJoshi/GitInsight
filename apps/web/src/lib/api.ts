export type Role = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'deactivated';
  passwordSet: boolean;
  googleLinked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  preferences: Preferences;
}

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  defaultView: 'chart' | 'table';
  digest: 'off' | 'daily' | 'weekly';
}

export interface BookmarkItem {
  id: string;
  githubId: number;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  avatarUrl: string;
  createdAt: string;
}
export interface CollectionItem {
  id: string;
  name: string;
  createdAt: string;
  bookmarks: BookmarkItem[];
}
export interface HistoryEntry {
  id: string;
  githubId: number;
  fullName: string;
  searchedAt: string;
}
export interface ComparisonSetItem {
  id: string;
  name: string;
  repos: string[];
  updatedAt: string;
}
export interface ComparisonEntry {
  repository: RepositoryMetadata;
  health: Health | null;
  healthPending: boolean;
  languages: Languages['languages'] | null;
}
export type ComparisonNarrative =
  | { available: false; reason: 'NOT_CONFIGURED'; message: string }
  | { available: true; narrative: string; bestFor: { repository: string; useCase: string }[]; model: string; generatedAt: string; sources: string[] };

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface RepositoryMetadata {
  id: number;
  owner: { login: string; avatarUrl: string; type: string; url: string };
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  homepage: string | null;
  stars: number;
  forks: number;
  watchers: number | null;
  openIssues: number;
  language: string | null;
  license: { spdxId: string | null; name: string } | null;
  sizeKb: number;
  topics: string[];
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  archived: boolean;
  isFork: boolean;
}

export interface RepositoryResponse {
  repository: RepositoryMetadata;
  fetchedAt: string;
  source: 'cache' | 'github' | 'stale';
}

export interface AnalyticsResult<T> {
  status: 'ready';
  data: T;
  computedAt: string;
  stale: boolean;
}

export interface Languages {
  totalBytes: number;
  languageCount: number;
  languages: { name: string; bytes: number; percent: number }[];
}
export interface Contributors {
  contributors: { login: string; avatarUrl: string; url: string; commits: number; isBot: boolean }[];
}
interface ActivityWindow {
  windowStart: string;
  windowEnd: string;
  totalCommits: number;
}
export interface CommitTrend extends ActivityWindow {
  monthly: { month: string; commits: number }[];
}
export interface Heatmap extends ActivityWindow {
  activeDays: number;
  days: { date: string; count: number }[];
}
export interface Frequency extends ActivityWindow {
  weekday: { day: string; commits: number }[];
}
export interface PullsIssues {
  openPullRequests: number;
  openIssues: number;
}
export interface Branches {
  defaultBranch: string;
  page: number;
  perPage: number;
  totalPages: number;
  branches: { name: string; protected: boolean; isDefault: boolean }[];
}

export interface HealthComponent {
  key: 'activity' | 'community' | 'maintenance' | 'popularity';
  label: string;
  score: number | null;
  basis: string[];
  reason?: string;
}
export interface Health {
  score: number | null;
  grade: string | null;
  formulaVersion: string;
  availableComponents: number;
  explanation: string;
  components: HealthComponent[];
}

type AiUnavailable = { available: false; reason: 'NOT_CONFIGURED' | 'INSUFFICIENT_HISTORY'; message: string };
type AiMeta = { available: true; model: string; generatedAt: string; sources: string[] };
export type AiSummary = AiUnavailable | (AiMeta & { summary: string; highlights: string[] });
export type AiTrend =
  | AiUnavailable
  | (AiMeta & { headline: string; insight: string; facts: { commitsLast3Months: number; commitsPrevious3Months: number; changePercent: number | null } });

export interface AlertItem {
  id: string;
  githubId: number;
  fullName: string;
  type: 'star_threshold' | 'new_release';
  threshold: number | null;
  active: boolean;
  triggered: boolean;
  lastStars: number | null;
  lastReleaseTag: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
}
export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}
export interface AdminUsage {
  platform: { users: number; admins: number; deactivated: number; activeThisWeek: number; repositories: number; bookmarks: number; activeAlerts: number; notifications: number };
  today: { apiRequests: number; searches: number; logins: number; exports: number };
  github: { authenticated: boolean; limit: number | null; remaining: number | null; resetAt: string | null; callsToday: number; errorsToday: number };
  llm: { configured: boolean; model: string | null; callsToday: number; failuresToday: number };
  alertIntervalMinutes: number;
  series: ({ date: string } & Record<string, number>)[];
}
export interface ActivityEntry {
  id: string;
  action: string;
  actorEmail: string | null;
  targetType: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get fields(): Record<string, string> {
    return (this.details.fields as Record<string, string> | undefined) ?? {};
  }
}

// The access token lives only in memory; the refresh token is an HttpOnly cookie the page cannot read.
let accessToken: string | null = null;
let sessionListener: ((user: User | null) => void) | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onSessionChange(listener: (user: User | null) => void) {
  sessionListener = listener;
}

/** Shares one in-flight refresh so parallel callers never replay a rotated token. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      const data: AuthResponse | null = res.ok ? await res.json() : null;
      accessToken = data?.accessToken ?? null;
      return data;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** POST to an endpoint that returns a file and save it with the server-provided name. */
export async function downloadFile(path: string, body: unknown, retry = true): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  if (res.status === 401 && retry && accessToken) {
    const session = await refreshSession();
    sessionListener?.(session?.user ?? null);
    if (session) return downloadFile(path, body, false);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error?.code ?? 'UNKNOWN', data.error?.message ?? 'Download failed.', data.error);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'gitinsight-report';
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && retry && accessToken) {
    const session = await refreshSession();
    sessionListener?.(session?.user ?? null);
    if (session) return api<T>(path, options, false);
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error?.code ?? 'UNKNOWN', data.error?.message ?? 'Request failed.', data.error);
  }
  return data as T;
}
