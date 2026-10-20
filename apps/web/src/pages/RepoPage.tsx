import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowUpRight, PlugZap } from 'lucide-react';
import { RepoSearch } from '../components/RepoSearch';
import { buttonClass } from '../components/ui';
import { parseRepoRef } from '../lib/repoRef';

const TABS = ['Overview', 'Languages', 'Contributors', 'Commits', 'PRs & Issues', 'Heatmap', 'Frequency', 'Branches', 'Health', 'AI Summary', 'AI Trend'];

export default function RepoPage() {
  const params = useParams();
  const [tab, setTab] = useState(TABS[0]);
  const ref = parseRepoRef(`${params.owner}/${params.repo}`);

  if (!ref.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="text-xl font-semibold">That doesn’t look like a repository</h1>
        <p className="mt-2 text-sm text-zinc-500">{ref.error}</p>
        <div className="mt-6">
          <RepoSearch size="lg" />
        </div>
      </div>
    );
  }

  const { owner, repo } = ref.value;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-zinc-500">{owner} /</p>
          <h1 className="truncate font-mono text-2xl font-medium tracking-tight sm:text-3xl">{repo}</h1>
        </div>
        <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
          View on GitHub <ArrowUpRight className="size-3.5" />
        </a>
      </div>

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

      <div role="tabpanel" className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
        <PlugZap className="size-6 text-zinc-400" aria-hidden />
        <h2 className="mt-4 font-medium">GitHub data isn’t connected yet</h2>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500">
          The dashboard layout is ready. Once the GitHub integration is in place, the {tab} view for{' '}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {owner}/{repo}
          </span>{' '}
          will load here.
        </p>
        <Link to="/" className={`${buttonClass('ghost', 'sm')} mt-6`}>
          Search another repository
        </Link>
      </div>
    </div>
  );
}
