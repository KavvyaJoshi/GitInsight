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
}

export interface AuthResponse {
  accessToken: string;
  user: User;
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
