import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, GitBranch, Lock } from 'lucide-react';
import type { Branches, CommitTrend, Contributors, Frequency, Heatmap, Languages, PullsIssues } from '../../lib/api';
import { compactNumber, exactNumber, formatDate } from '../../lib/format';
import { useAnalytics } from '../../lib/useAnalytics';
import { Button } from '../ui';
import { CommitHeatmap, longestStreak } from './Heatmap';
import { AnalyticsPanel, ChartTooltip, DataTable, SummaryRow } from './Panel';

const AXIS = { fill: 'var(--chart-axis)', fontSize: 12 };
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`);
const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en', { month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: 'UTC' });
const windowLabel = (d: { windowStart: string; windowEnd: string }) => `${formatDate(d.windowStart)} – ${formatDate(d.windowEnd)}`;

// ---- Languages ----

export function LanguagesView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<Languages>(`/repositories/${repoId}/languages`);
  const colorFor = (name: string, i: number) => (name === 'Other' ? 'var(--chart-other)' : SERIES[i]);

  return (
    <AnalyticsPanel
      title="Languages"
      description="Share of the codebase by bytes of code, as detected by GitHub."
      state={state}
      onRetry={retry}
      isEmpty={(d) => d.languages.length === 0}
      emptyMessage="GitHub hasn’t detected any languages in this repository."
      chart={(d) => (
        <div className="grid items-center gap-8 md:grid-cols-[260px_1fr]">
          <div className="relative mx-auto size-60">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={d.languages}
                  dataKey="bytes"
                  nameKey="name"
                  innerRadius={78}
                  outerRadius={116}
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {d.languages.map((l, i) => (
                    <Cell key={l.name} fill={colorFor(l.name, i)} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    const item = active && payload?.[0]?.payload as Languages['languages'][number] | undefined;
                    return item ? <ChartTooltip title={item.name} rows={[{ label: 'Share', value: `${item.percent.toFixed(1)}%` }]} /> : null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-3xl font-medium">{d.languageCount}</span>
              <span className="text-xs text-zinc-500">language{d.languageCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <ul className="space-y-2.5">
            {d.languages.map((l, i) => (
              <li key={l.name} className="flex items-center gap-3 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(l.name, i) }} />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100 sm:block dark:bg-zinc-800">
                  <span className="block h-full rounded-full" style={{ width: `${l.percent}%`, backgroundColor: colorFor(l.name, i) }} />
                </span>
                <span className="w-14 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{l.percent.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      table={(d) => (
        <DataTable
          columns={['Language', 'Bytes', 'Share']}
          rows={d.languages.map((l) => [l.name, exactNumber(l.bytes), `${l.percent.toFixed(1)}%`])}
        />
      )}
    />
  );
}

// ---- Contributors ----

export function ContributorsView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<Contributors>(`/repositories/${repoId}/contributors`);

  return (
    <AnalyticsPanel
      title="Top contributors"
      description="The ten people with the most commits on the default branch."
      state={state}
      onRetry={retry}
      isEmpty={(d) => d.contributors.length === 0}
      emptyMessage="This repository has no commits yet."
      chart={(d) => (
        <div style={{ height: d.contributors.length * 36 + 24 }}>
          <ResponsiveContainer>
            <BarChart data={d.contributors} layout="vertical" margin={{ left: 0, right: 48, top: 0, bottom: 0 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactNumber} />
              <YAxis type="category" dataKey="login" width={120} tick={{ ...AXIS, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
                content={({ active, payload }) => {
                  const c = active && (payload?.[0]?.payload as Contributors['contributors'][number] | undefined);
                  return c ? <ChartTooltip title={`${c.login}${c.isBot ? ' (bot)' : ''}`} rows={[{ label: 'Commits', value: exactNumber(c.commits) }]} /> : null;
                }}
              />
              <Bar
                dataKey="commits"
                fill="var(--chart-accent)"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                label={{ position: 'right', fill: 'var(--chart-axis)', fontSize: 12, formatter: (v: unknown) => compactNumber(Number(v)) }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      table={(d) => (
        <DataTable
          columns={['Contributor', 'Commits']}
          rows={d.contributors.map((c) => [
            <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
              <img src={c.avatarUrl} alt="" className="size-5 rounded-full" />
              {c.login}
              {c.isBot && <span className="text-xs text-zinc-400">bot</span>}
            </a>,
            exactNumber(c.commits),
          ])}
        />
      )}
    />
  );
}

// ---- Commits by month ----

export function CommitsView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<CommitTrend>(`/repositories/${repoId}/commits`);

  return (
    <AnalyticsPanel
      title="Commits per month"
      description="Commits to the default branch over the last twelve months, including months with none."
      state={state}
      onRetry={retry}
      summary={(d) => {
        const busiest = d.monthly.reduce((a, b) => (b.commits > a.commits ? b : a));
        // Sum the plotted months so the headline always matches the chart.
        const total = d.monthly.reduce((sum, m) => sum + m.commits, 0);
        return (
          <SummaryRow
            items={[
              { label: 'Commits, last 12 months', value: exactNumber(total) },
              { label: 'Monthly average', value: exactNumber(Math.round(total / 12)) },
              { label: 'Busiest month', value: busiest.commits ? monthLabel(busiest.month, 'long') : '—' },
            ]}
          />
        );
      }}
      chart={(d) => (
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={d.monthly} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m)} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactNumber} />
              <Tooltip
                cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const m = active && (payload?.[0]?.payload as CommitTrend['monthly'][number] | undefined);
                  return m ? <ChartTooltip title={monthLabel(m.month, 'long')} rows={[{ label: 'Commits', value: exactNumber(m.commits) }]} /> : null;
                }}
              />
              <Line
                type="monotone"
                dataKey="commits"
                stroke="var(--chart-accent)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--chart-accent)', stroke: 'var(--chart-surface)', strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      table={(d) => <DataTable columns={['Month', 'Commits']} rows={d.monthly.map((m) => [monthLabel(m.month, 'long'), exactNumber(m.commits)])} />}
    />
  );
}

// ---- Pull requests vs issues ----

export function PullsIssuesView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<PullsIssues>(`/repositories/${repoId}/pulls-issues`);

  return (
    <AnalyticsPanel
      title="Open pull requests and issues"
      description="Counted separately, so pull requests are never included in the issue count."
      state={state}
      onRetry={retry}
      summary={(d) => (
        <SummaryRow
          items={[
            { label: 'Open pull requests', value: exactNumber(d.openPullRequests) },
            { label: 'Open issues', value: exactNumber(d.openIssues) },
          ]}
        />
      )}
      chart={(d) => {
        const data = [
          { name: 'Pull requests', value: d.openPullRequests, color: SERIES[0] },
          { name: 'Issues', value: d.openIssues, color: SERIES[1] },
        ];
        return (
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 0, right: 48, top: 0, bottom: 0 }} barCategoryGap={18}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactNumber} />
                <YAxis type="category" dataKey="name" width={110} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const row = active && (payload?.[0]?.payload as (typeof data)[number] | undefined);
                    return row ? <ChartTooltip title={`Open ${row.name.toLowerCase()}`} rows={[{ label: 'Count', value: exactNumber(row.value), color: row.color }]} /> : null;
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  label={{ position: 'right', fill: 'var(--chart-axis)', fontSize: 12, formatter: (v: unknown) => exactNumber(Number(v)) }}
                >
                  {data.map((row) => (
                    <Cell key={row.name} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      }}
      table={(d) => (
        <DataTable
          columns={['Type', 'Open']}
          rows={[
            ['Pull requests', exactNumber(d.openPullRequests)],
            ['Issues', exactNumber(d.openIssues)],
          ]}
        />
      )}
    />
  );
}

// ---- Heatmap ----

export function HeatmapView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<Heatmap>(`/repositories/${repoId}/heatmap`);

  return (
    <AnalyticsPanel
      title="Commit activity"
      description="Daily commits over a rolling twelve months. Darker squares mean more commits."
      state={state}
      onRetry={retry}
      summary={(d) => (
        <SummaryRow
          items={[
            { label: 'Commits', value: exactNumber(d.totalCommits) },
            { label: 'Active days', value: `${d.activeDays} / ${d.days.length}` },
            { label: 'Longest streak', value: `${longestStreak(d.days)} days` },
          ]}
        />
      )}
      chart={(d) => (
        <div className="space-y-2">
          <CommitHeatmap days={d.days} />
          <p className="text-xs text-zinc-400">{windowLabel(d)} · UTC</p>
        </div>
      )}
      table={(d) => {
        const byMonth = new Map<string, { commits: number; active: number }>();
        for (const day of d.days) {
          const m = byMonth.get(day.date.slice(0, 7)) ?? { commits: 0, active: 0 };
          byMonth.set(day.date.slice(0, 7), { commits: m.commits + day.count, active: m.active + (day.count > 0 ? 1 : 0) });
        }
        return (
          <DataTable
            columns={['Month', 'Commits', 'Active days']}
            rows={[...byMonth].map(([month, m]) => [monthLabel(month, 'long'), exactNumber(m.commits), String(m.active)])}
          />
        );
      }}
    />
  );
}

// ---- Weekday frequency ----

export function FrequencyView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<Frequency>(`/repositories/${repoId}/frequency`);

  return (
    <AnalyticsPanel
      title="Commits by weekday"
      description="When work happens across the week, over the last twelve months (UTC)."
      state={state}
      onRetry={retry}
      summary={(d) => {
        const busiest = d.weekday.reduce((a, b) => (b.commits > a.commits ? b : a));
        const weekend = d.weekday[5].commits + d.weekday[6].commits;
        return (
          <SummaryRow
            items={[
              { label: 'Busiest day', value: busiest.commits ? busiest.day : '—' },
              { label: 'Weekend share', value: d.totalCommits ? `${Math.round((weekend / d.totalCommits) * 100)}%` : '—' },
            ]}
          />
        );
      }}
      chart={(d) => (
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={d.weekday} margin={{ left: -12, right: 8, top: 8, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tickFormatter={(day: string) => day.slice(0, 3)} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactNumber} />
              <Tooltip
                cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
                content={({ active, payload }) => {
                  const row = active && (payload?.[0]?.payload as Frequency['weekday'][number] | undefined);
                  return row ? <ChartTooltip title={row.day} rows={[{ label: 'Commits', value: exactNumber(row.commits) }]} /> : null;
                }}
              />
              <Bar dataKey="commits" fill="var(--chart-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      table={(d) => <DataTable columns={['Day', 'Commits']} rows={d.weekday.map((w) => [w.day, exactNumber(w.commits)])} />}
    />
  );
}

// ---- Branches ----

export function BranchesView({ repoId }: { repoId: number }) {
  const [page, setPage] = useState(1);
  const { state, retry } = useAnalytics<Branches>(`/repositories/${repoId}/branches?page=${page}`);
  const loaded = state.status === 'ready' ? state.result.data : null;

  return (
    <AnalyticsPanel
      title="Branches"
      description="Every branch in the repository, fifty per page."
      state={state}
      onRetry={retry}
      summary={(d) => (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <GitBranch className="size-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Default branch</span>
          <span className="font-mono text-sm font-medium">{d.defaultBranch}</span>
        </div>
      )}
      chart={(d) => (
        <div>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
            {d.branches.map((b) => (
              <li key={b.name} className="flex items-center gap-3 px-4 py-2.5">
                <GitBranch className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{b.name}</span>
                {b.isDefault && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">default</span>
                )}
                {b.protected && (
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <Lock className="size-3" /> protected
                  </span>
                )}
              </li>
            ))}
          </ul>
          {d.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                Page {d.page} of {d.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={!loaded || page >= loaded.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    />
  );
}
