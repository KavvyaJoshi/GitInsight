import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowUpRight, CloudOff, Layers, RotateCw, SearchX, Timer } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { BookmarkButton } from '../components/BookmarkButton';
import {
  BranchesView,
  CommitsView,
  ContributorsView,
  FrequencyView,
  HeatmapView,
  LanguagesView,
  PullsIssuesView,
} from '../components/analytics/Views';
import { AiSummaryView, AiTrendView, HealthView, ScoreRing, healthPath } from '../components/analytics/Insights';
import { useAnalytics } from '../lib/useAnalytics';
import { OverviewCard, OverviewSkeleton } from '../components/repo/OverviewCard';
import { RepoSearch } from '../components/RepoSearch';
import { Alert, Button, buttonClass } from '../components/ui';
import { api, ApiError, type Health, type RepositoryResponse } from '../lib/api';
import { formatTime, relativeTime } from '../lib/format';
import { parseRepoRef, type RepoRef } from '../lib/repoRef';

const TABS = [
  { slug: 'overview', label: 'Overview' },
  { slug: 'languages', label: 'Languages' },
  { slug: 'contributors', label: 'Contributors' },
  { slug: 'commits', label: 'Commits' },
  { slug: 'pulls-issues', label: 'PRs & Issues' },
  { slug: 'heatmap', label: 'Heatmap' },
  { slug: 'frequency', label: 'Frequency' },
  { slug: 'branches', label: 'Branches' },
  { slug: 'health', label: 'Health' },
  { slug: 'ai-summary', label: 'AI Summary' },
  { slug: 'ai-trend', label: 'AI Trend' },
];

const ANALYTICS_VIEWS: Record<string, (props: { repoId: number; repoUrl: string }) => ReactNode> = {
  languages: LanguagesView,
  contributors: ContributorsView,
  commits: CommitsView,
  'pulls-issues': PullsIssuesView,
  heatmap: HeatmapView,
  frequency: FrequencyView,
  branches: BranchesView,
  health: HealthView,
  'ai-summary': AiSummaryView,
  'ai-trend': AiTrendView,
};

/** Prominent health score in the header (SRS 3.1); opens the breakdown. */
function HealthBadge({ repoId, onOpen }: { repoId: number; onOpen: () => void }) {
  const { state } = useAnalytics<Health>(healthPath(repoId));
  const health = state.status === 'ready' ? state.result.data : null;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2.5 rounded-lg border border-zinc-200 py-1.5 pr-3 pl-1.5 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      aria-label={health?.score != null ? `Health score ${health.score} out of 100, view breakdown` : 'View health score'}
    >
      <span className="relative">
        <ScoreRing score={health?.score ?? null} size={36} stroke={4} />
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium tabular-nums">
          {state.status === 'ready' ? (health?.score ?? '—') : <span className="size-1.5 animate-pulse rounded-full bg-zinc-400" />}
        </span>
      </span>
      <span className="leading-tight">
        <span className="block text-xs text-zinc-500">Health</span>
        <span className="block text-sm font-medium">{state.status === 'ready' ? (health?.grade ?? 'Not available') : 'Calculating…'}</span>
      </span>
    </button>
  );
}

type LoadState = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: RepositoryResponse };

function useRepository(ref: RepoRef | null) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const key = ref ? `${ref.owner}/${ref.repo}` : null;

  useEffect(() => {
    if (!key) return;
    const [owner, repo] = key.split('/');
    let cancelled = false;
    setState({ status: 'loading' });
    api<RepositoryResponse>(`/repositories/search?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((error) => !cancelled && setState({ status: 'error', error }));
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  return { state, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

function ErrorState({ error, owner, repo, onRetry }: { error: unknown; owner: string; repo: string; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : 'NETWORK';

  if (code === 'REPO_NOT_FOUND') {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <SearchX className="mx-auto size-7 text-zinc-400" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold">Repository not found</h2>
        <p className="mt-2 text-sm text-zinc-500">
          We couldn’t find <span className="font-mono text-zinc-700 dark:text-zinc-300">github.com/{owner}/{repo}</span>. It may be private, renamed or
          deleted. GitInsight works with public repositories only.
        </p>
        <div className="mt-8 text-left">
          <RepoSearch size="lg" />
        </div>
      </div>
    );
  }

  const resetAt = error instanceof ApiError && typeof error.details.resetAt === 'string' ? error.details.resetAt : null;
  const rateLimited = code === 'RATE_LIMITED';
  const Icon = rateLimited ? Timer : CloudOff;

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <Icon className="mx-auto size-7 text-zinc-400" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold">{rateLimited ? 'GitHub rate limit reached' : 'Couldn’t load this repository'}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {rateLimited
          ? `GitInsight has used its GitHub API allowance for now.${resetAt ? ` It resets at ${formatTime(resetAt)}.` : ''}`
          : error instanceof ApiError
            ? error.message
            : 'The GitInsight server could not be reached. Check your connection.'}
      </p>
      <Button variant="secondary" className="mt-6" onClick={onRetry}>
        <RotateCw className="size-4" /> Try again
      </Button>
    </div>
  );
}

export default function RepoPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.find((t) => t.slug === searchParams.get('tab')) ?? TABS[0];
  const setTab = (slug: string) => setSearchParams(slug === 'overview' ? {} : { tab: slug }, { replace: true });
  const parsed = parseRepoRef(`${params.owner}/${params.repo}`);
  const ref = parsed.ok ? parsed.value : null;
  const { state, retry } = useRepository(ref);

  // GitHub follows renames and is case-insensitive; keep the URL on the canonical name.
  useEffect(() => {
    if (state.status !== 'ready' || !ref) return;
    const canonical = state.data.repository.fullName;
    if (canonical !== `${ref.owner}/${ref.repo}`) navigate({ pathname: `/${canonical}`, search: window.location.search }, { replace: true });
  }, [state, ref, navigate]);

  if (!parsed.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="text-xl font-semibold">That doesn’t look like a repository</h1>
        <p className="mt-2 text-sm text-zinc-500">{parsed.error}</p>
        <div className="mt-6">
          <RepoSearch size="lg" />
        </div>
      </div>
    );
  }

  const { owner, repo } = parsed.value;
  const data = state.status === 'ready' ? state.data : null;
  const meta = data?.repository;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {meta ? (
            <img src={meta.owner.avatarUrl} alt="" className="size-12 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800" />
          ) : (
            <div className="size-12 shrink-0 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          )}
          <div className="min-w-0">
            <p className="font-mono text-sm text-zinc-500">{meta?.owner.login ?? owner} /</p>
            <h1 className="truncate font-mono text-2xl font-medium tracking-tight sm:text-3xl">{meta?.name ?? repo}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {meta && <HealthBadge repoId={meta.id} onOpen={() => setTab('health')} />}
          {meta && user && (
            <>
              <BookmarkButton repo={meta} />
              <Link to={`/compare?repos=${encodeURIComponent(meta.fullName)}`} className={buttonClass('secondary', 'sm')}>
                <Layers className="size-3.5" /> Compare
              </Link>
            </>
          )}
          <a href={meta?.url ?? `https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
            View on GitHub <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </div>

      {state.status === 'error' ? (
        <ErrorState error={state.error} owner={owner} repo={repo} onRetry={retry} />
      ) : (
        <>
          <div className="mt-6 -mx-4 overflow-x-auto border-b border-zinc-200 px-4 sm:mx-0 sm:px-0 dark:border-zinc-800" role="tablist">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.slug}
                  role="tab"
                  aria-selected={t === tab}
                  onClick={() => setTab(t.slug)}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
                    t === tab
                      ? 'border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div role="tabpanel" className="mt-6 space-y-4">
            {data?.source === 'stale' && (
              <Alert tone="info" title="Showing saved data">
                GitHub can’t be reached right now, so this is the copy saved {relativeTime(data.fetchedAt)}.
              </Alert>
            )}
            {(() => {
              if (!meta) return <OverviewSkeleton />;
              const View = ANALYTICS_VIEWS[tab.slug];
              return View ? <View key={meta.id} repoId={meta.id} repoUrl={meta.url} /> : <OverviewCard repo={meta} />;
            })()}
            {data && tab.slug === 'overview' && (
              <p className="text-xs text-zinc-400">
                Fetched from GitHub {relativeTime(data.fetchedAt)} · refreshed at most every 15 minutes ·{' '}
                <Link to="/" className="hover:text-zinc-600 hover:underline dark:hover:text-zinc-300">
                  search another repository
                </Link>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
