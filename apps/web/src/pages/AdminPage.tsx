import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, Play, RotateCw, Search, Server } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ChartTooltip } from '../components/analytics/Panel';
import { useToast } from '../components/Toast';
import { Alert, Avatar, Button, RoleBadge, Spinner } from '../components/ui';
import { api, ApiError, type ActivityEntry, type AdminUsage, type User } from '../lib/api';
import { compactNumber, exactNumber, formatTime, relativeTime } from '../lib/format';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const AXIS = { fill: 'var(--chart-axis)', fontSize: 11 };

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="bg-white px-5 py-4 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-zinc-400">{note}</p>}
    </div>
  );
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">{children}</div>;
}

function DailyChart({ title, data, dataKey }: { title: string; data: AdminUsage['series']; dataKey: string }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-zinc-500">Last 14 days</p>
      <div className="mt-4 h-40">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8)} tick={AXIS} axisLine={false} tickLine={false} interval={1} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactNumber} />
            <Tooltip
              cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
              content={({ active, payload }) => {
                const row = active && (payload?.[0]?.payload as AdminUsage['series'][number] | undefined);
                return row ? <ChartTooltip title={new Date(row.date).toLocaleDateString('en', { dateStyle: 'medium' })} rows={[{ label: title, value: exactNumber(row[dataKey] ?? 0) }]} /> : null;
              }}
            />
            <Bar dataKey={(row: AdminUsage['series'][number]) => row[dataKey] ?? 0} fill="var(--chart-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ---- Overview ----

function Overview() {
  const toast = useToast();
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    api<AdminUsage>('/admin/usage')
      .then(setUsage)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load usage.'));
  }, []);
  useEffect(load, [load]);

  async function runAlerts() {
    setRunning(true);
    try {
      const r = await api<{ skipped: boolean; rules?: number; fired?: number; errors?: number }>('/admin/alerts/run', { method: 'POST' });
      toast(r.skipped ? 'Another alert check is already running' : `Checked ${r.rules} alert(s): ${r.fired} notification(s), ${r.errors} error(s)`);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'The alert check failed.', 'error');
    } finally {
      setRunning(false);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!usage) return <Spinner label="Loading usage" />;

  const gh = usage.github;
  const used = gh.limit !== null && gh.remaining !== null ? gh.limit - gh.remaining : null;
  const usedPct = used !== null && gh.limit ? (used / gh.limit) * 100 : 0;

  return (
    <div className="space-y-8">
      <StatGrid>
        <Stat label="Accounts" value={usage.platform.users} note={`${usage.platform.admins} admin · ${usage.platform.deactivated} deactivated`} />
        <Stat label="Active this week" value={usage.platform.activeThisWeek} note="Signed in during the last 7 days" />
        <Stat label="Repositories tracked" value={usage.platform.repositories} note={`${usage.platform.bookmarks} bookmarks`} />
        <Stat label="Active alerts" value={usage.platform.activeAlerts} note={`Checked every ${usage.alertIntervalMinutes} min`} />
      </StatGrid>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Today</h2>
        <StatGrid>
          <Stat label="API requests" value={exactNumber(usage.today.apiRequests)} />
          <Stat label="Repository searches" value={exactNumber(usage.today.searches)} />
          <Stat label="Sign-ins" value={exactNumber(usage.today.logins)} />
          <Stat label="Reports exported" value={exactNumber(usage.today.exports)} />
        </StatGrid>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Server className="size-4" />
            <h3 className="text-sm font-medium">GitHub API</h3>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${gh.authenticated ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300'}`}>
              {gh.authenticated ? 'Token configured' : 'No token: 60 requests/hour'}
            </span>
          </div>
          {gh.limit === null ? (
            <p className="mt-4 text-sm text-zinc-500">No GitHub calls since the server started.</p>
          ) : (
            <>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="font-mono text-2xl font-medium tabular-nums">{exactNumber(gh.remaining!)}</span>
                <span className="text-xs text-zinc-500">of {exactNumber(gh.limit)} left this hour</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="meter" aria-valuenow={used ?? 0} aria-valuemax={gh.limit} aria-label="GitHub quota used">
                <div className={`h-full rounded-full ${usedPct > 85 ? 'bg-red-500' : 'bg-(--chart-accent)'}`} style={{ width: `${usedPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">{gh.resetAt ? `Resets at ${formatTime(gh.resetAt)}` : ''}</p>
            </>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            {exactNumber(gh.callsToday)} calls today · {exactNumber(gh.errorsToday)} errors
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Bot className="size-4" />
            <h3 className="text-sm font-medium">AI insights (LLM)</h3>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${usage.llm.configured ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
              {usage.llm.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <p className="mt-4 font-mono text-sm">{usage.llm.model ?? 'No model'}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-zinc-500">Generations today</dt>
              <dd className="font-mono text-2xl font-medium tabular-nums">{usage.llm.callsToday}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Failures today</dt>
              <dd className="font-mono text-2xl font-medium tabular-nums">{usage.llm.failuresToday}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">Cached results are reused, so repeat views do not call the model.</p>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DailyChart title="Repository searches" data={usage.series} dataKey="repo.searches" />
        <DailyChart title="GitHub API calls" data={usage.series} dataKey="github.calls" />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex-1">
          <h3 className="text-sm font-medium">Background alert check</h3>
          <p className="text-xs text-zinc-500">Runs automatically every {usage.alertIntervalMinutes} minutes. Run it now to check every active alert immediately.</p>
        </div>
        <Button variant="secondary" size="sm" loading={running} onClick={runAlerts}>
          <Play className="size-3.5" /> Run now
        </Button>
      </div>
    </div>
  );
}

// ---- Users ----

function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api<{ users: User[] }>('/admin/users')
      .then((r) => setUsers(r.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load users.'));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.email.includes(q) || u.name.toLowerCase().includes(q));
  }, [users, query]);

  async function setStatus(u: User, status: 'active' | 'deactivated') {
    if (status === 'deactivated' && !confirm(`Deactivate ${u.email}? They will be signed out everywhere and unable to sign in.`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status } });
      toast(status === 'deactivated' ? `${u.email} deactivated` : `${u.email} reactivated`);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update the account.', 'error');
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!users) return <Spinner label="Loading users" />;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Search className="size-4 text-zinc-400" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or email" aria-label="Filter users" className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400" />
        <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
          {filtered.length} of {users.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/50">
            <tr>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 font-medium">Last sign-in</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar user={u} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.name || 'Unnamed user'}</p>
                      <p className="truncate text-xs text-zinc-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    <span className={`size-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Never'}</td>
                <td className="px-4 py-3 text-right">
                  {u.id === me?.id ? (
                    <span className="text-xs text-zinc-400">You</span>
                  ) : u.status === 'active' ? (
                    <Button variant="danger" size="sm" onClick={() => setStatus(u, 'deactivated')}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setStatus(u, 'active')}>
                      Reactivate
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Activity log ----

const FILTERS = [
  { id: '', label: 'Everything' },
  { id: 'admin.', label: 'Admin actions' },
  { id: 'auth.', label: 'Sign-ins' },
  { id: 'export.', label: 'Exports' },
];

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.register': 'Created an account',
  'auth.lockout': 'Account locked after failed sign-ins',
  'admin.user.deactivate': 'Deactivated a user',
  'admin.user.reactivate': 'Reactivated a user',
  'admin.alerts.run': 'Ran the alert check',
  'export.created': 'Exported a report',
};

function Activity() {
  const [filter, setFilter] = useState('');
  const [logs, setLogs] = useState<ActivityEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      const params = new URLSearchParams({ limit: '50', ...(filter ? { action: filter } : {}), ...(before ? { before } : {}) });
      const res = await api<{ logs: ActivityEntry[]; hasMore: boolean }>(`/admin/logs?${params}`);
      setLogs((list) => (before ? [...(list ?? []), ...res.logs] : res.logs));
      setHasMore(res.hasMore);
    },
    [filter],
  );
  useEffect(() => {
    setLogs(null);
    load().catch(() => setLogs([]));
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.id ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400'}`}
          >
            {f.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => load()}>
          <RotateCw className="size-3.5" /> Refresh
        </Button>
      </div>
      {!logs && <Spinner label="Loading activity" />}
      {logs?.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">Nothing logged yet.</p>}
      {logs && logs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Who</th>
                <th className="px-4 py-2.5 font-medium">What</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500" title={new Date(l.createdAt).toLocaleString()}>
                    {relativeTime(l.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">{l.actorEmail ?? <span className="text-zinc-400">System</span>}</td>
                  <td className="px-4 py-2.5">
                    <span className={`mr-2 rounded px-1.5 py-0.5 font-mono text-[11px] ${l.action.startsWith('admin.') ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                      {l.action}
                    </span>
                    {ACTION_LABELS[l.action] ?? ''}
                    {l.details && 'format' in l.details ? ` (${String(l.details.format).toUpperCase()})` : ''}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.targetLabel ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{l.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <Button variant="secondary" size="sm" onClick={() => load(logs!.at(-1)!.createdAt)}>
          Load older entries
        </Button>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'activity', label: 'Activity log' },
] as const;

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs tracking-wide text-zinc-500 uppercase">Admin console</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Platform</h1>
      <div className="mt-6 mb-8 flex gap-1 border-b border-zinc-200 dark:border-zinc-800" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${tab === t.id ? 'border-zinc-900 font-medium dark:border-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <Overview /> : tab === 'users' ? <Users /> : <Activity />}
    </div>
  );
}
