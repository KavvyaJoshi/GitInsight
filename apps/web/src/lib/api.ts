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
export type AiSummary =
  | AiUnavailable
  | (AiMeta & { whatItIs: string; whatsHappening: string; currentWork: string[]; terms: { term: string; meaning: string }[] });
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

// The API runs on Render's free plan, which sleeps when idle and takes up to a minute or so to boot.
export type ServerStatus = 'unknown' | 'waking' | 'ready' | 'down';

const WAKE_NOTICE_DELAY_MS = 2500;
const WAKE_LIMIT_MS = 3 * 60_000;
const WAKE_POLL_MS = 3000;

let serverStatus: ServerStatus = 'unknown';
let wakeInFlight: Promise<boolean> | null = null;
const statusListeners = new Set<(status: ServerStatus) => void>();

function setServerStatus(next: ServerStatus) {
  serverStatus = next;
  statusListeners.forEach((listener) => listener(next));
}

export function onServerStatus(listener: (status: ServerStatus) => void): () => void {
  statusListeners.add(listener);
  listener(serverStatus);
  return () => statusListeners.delete(listener);
}

const isJson = (res: Response) => res.headers.get('content-type')?.includes('application/json') ?? false;

async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    return res.ok && isJson(res);
  } catch {
    return false;
  }
}

/** Resolves once /api/health answers; shows the wake-up notice if that takes more than a moment. */
function serverReady(): Promise<boolean> {
  if (serverStatus === 'ready') return Promise.resolve(true);
  wakeInFlight ??= (async () => {
    const notice = setTimeout(() => setServerStatus('waking'), WAKE_NOTICE_DELAY_MS);
    try {
      const deadline = Date.now() + WAKE_LIMIT_MS;
      while (Date.now() < deadline) {
        if (await pingHealth()) {
          setServerStatus('ready');
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, WAKE_POLL_MS));
      }
      setServerStatus('down');
      return false;
    } finally {
      clearTimeout(notice);
      wakeInFlight = null;
    }
  })();
  return wakeInFlight;
}

/** A non-JSON 502–504 (or HTML success page) comes from Vercel's or Render's proxy, not the GitInsight API. */
const fromProxy = (res: Response) => !isJson(res) && res.status !== 204 && (res.ok || (res.status >= 502 && res.status <= 504));

/**
 * fetch for the API that rides out a cold start: it waits for the server first, and if the server went
 * to sleep anyway, waits again and resends. Only reads and token refreshes are resent, since replaying
 * another write could apply it twice.
 */
async function apiFetch(path: string, init: RequestInit, resend: boolean): Promise<Response> {
  await serverReady();
  const send = () => fetch(`/api${path}`, { credentials: 'include', ...init });
  // The server fell asleep since the last check (it idles out after 15 minutes).
  const wakeAgain = () => {
    serverStatus = 'unknown';
    return serverReady();
  };
  try {
    const res = await send();
    if (!fromProxy(res)) return res;
    if (!resend) {
      void wakeAgain();
      return res;
    }
  } catch (err) {
    if (!resend) {
      void wakeAgain();
      throw err;
    }
  }
  await wakeAgain();
  return send();
}

const networkError = () =>
  new ApiError(0, 'NETWORK_ERROR', 'Couldn’t reach the GitInsight server. Check your connection and try again in a moment.');

/** Shares one in-flight refresh so parallel callers never replay a rotated token. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await apiFetch('/auth/refresh', { method: 'POST' }, true);
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
  // Exports are read-only on the server, so resending one after a cold start is safe.
  const res = await apiFetch(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
    },
    true,
  ).catch(() => {
    throw networkError();
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

  const method = options.method ?? 'GET';
  const res = await apiFetch(path, { method, headers, body: options.body !== undefined ? JSON.stringify(options.body) : undefined }, method === 'GET').catch(() => {
    throw networkError();
  });

  if (res.status === 401 && retry && accessToken) {
    const session = await refreshSession();
    sessionListener?.(session?.user ?? null);
    if (session) return api<T>(path, options, false);
  }
  if (res.status === 204) return undefined as T;

  const json = isJson(res);
  const data = json ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !json) {
    // A non-JSON response means something other than the GitInsight API answered (proxy, host error page, cold start).
    const fallback = json
      ? 'Request failed.'
      : res.ok
        ? 'The GitInsight server is still starting up. Please try again in a moment.'
      : res.status >= 502 && res.status <= 504
        ? 'The GitInsight server is starting up or unreachable. Please try again in a minute.'
        : `The GitInsight server didn’t respond as expected (status ${res.status}).`;
    throw new ApiError(res.status, data.error?.code ?? 'UNKNOWN', data.error?.message ?? fallback, data.error);
  }
  return data as T;
}
