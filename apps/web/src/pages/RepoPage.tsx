import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowUpRight, BarChart3, CloudOff, RotateCw, SearchX, Timer } from 'lucide-react';
import { OverviewCard, OverviewSkeleton } from '../components/repo/OverviewCard';
import { RepoSearch } from '../components/RepoSearch';
import { Alert, Button, buttonClass } from '../components/ui';
import { api, ApiError, type RepositoryResponse } from '../lib/api';
import { formatTime, relativeTime } from '../lib/format';
import { parseRepoRef, type RepoRef } from '../lib/repoRef';

const TABS = ['Overview', 'Languages', 'Contributors', 'Commits', 'PRs & Issues', 'Heatmap', 'Frequency', 'Branches', 'Health', 'AI Summary', 'AI Trend'];

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

function PendingTab({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
      <BarChart3 className="size-6 text-zinc-400" aria-hidden />
      <h2 className="mt-4 font-medium">{tab} isn’t available yet</h2>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500">This view arrives with repository analytics. The Overview tab already shows live data.</p>
    </div>
  );
}

export default function RepoPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(TABS[0]);
  const parsed = parseRepoRef(`${params.owner}/${params.repo}`);
  const ref = parsed.ok ? parsed.value : null;
  const { state, retry } = useRepository(ref);

  // GitHub follows renames and is case-insensitive; keep the URL on the canonical name.
  useEffect(() => {
    if (state.status !== 'ready' || !ref) return;
    const canonical = state.data.repository.fullName;
    if (canonical !== `${ref.owner}/${ref.repo}`) navigate(`/${canonical}`, { replace: true });
  }, [state, ref, navigate]);

  useEffect(() => setTab(TABS[0]), [params.owner, params.repo]);

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
        <a href={meta?.url ?? `https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
          View on GitHub <ArrowUpRight className="size-3.5" />
        </a>
      </div>

      {state.status === 'error' ? (
        <ErrorState error={state.error} owner={owner} repo={repo} onRetry={retry} />
      ) : (
        <>
          <div className="mt-6 -mx-4 overflow-x-auto border-b border-zinc-200 px-4 sm:mx-0 sm:px-0 dark:border-zinc-800" role="tablist">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === tab}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
                    t === tab
                      ? 'border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t}
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
            {tab !== 'Overview' ? <PendingTab tab={tab} /> : meta ? <OverviewCard repo={meta} /> : <OverviewSkeleton />}
            {data && (
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
