import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { RepoSearch } from '../components/RepoSearch';
import { buttonClass } from '../components/ui';

const SECTIONS: { title: string; body: string; tabs: string[] }[] = [
  {
    title: 'AI summary in plain English',
    body: 'What the project is, what’s happening with it and what the team is working on right now, written so anyone can follow.',
    tabs: ['AI Summary', 'AI Trend'],
  },
  { title: 'Branch tree', body: 'Every branch grown as a living tree: the trunk is the main version and each leaf is someone trying an idea.', tabs: ['Branch tree'] },
  { title: 'Health score', body: 'One 0–100 score built from activity, community, maintenance and popularity, with the breakdown shown.', tabs: ['Health'] },
  { title: 'Activity', body: 'Monthly commit trend, a twelve-month heatmap and which weekdays the work happens.', tabs: ['Commits', 'Heatmap', 'Frequency'] },
  { title: 'People and code', body: 'The top ten contributors and the language mix, plus stars, forks and licence on one card.', tabs: ['Contributors', 'Languages', 'Overview'] },
  { title: 'Pull requests and issues', body: 'Open pull requests and open issues, counted separately so neither inflates the other.', tabs: ['PRs & Issues'] },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-2xl px-4 pt-20 pb-16 sm:pt-28 sm:pb-20">
          <p className="font-mono text-xs tracking-wide text-emerald-700 uppercase dark:text-emerald-400">Public GitHub repositories · Read-only</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How healthy is that repository, really?</h1>
          <p className="mt-4 text-lg text-pretty text-zinc-600 dark:text-zinc-400">
            Enter any public repository to see who works on it, how often, in which languages, and how well it is maintained.
          </p>
          <div className="mt-8">
            <RepoSearch size="lg" autoFocus />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="text-sm font-medium text-zinc-500">What each repository dashboard shows</h2>
        <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
          {SECTIONS.map((s) => (
            <div key={s.title} className="bg-white p-6 dark:bg-zinc-950">
              <h3 className="font-medium">{s.title}</h3>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{s.body}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {s.tabs.map((tab) => (
                  <span key={tab} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    {tab}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!user && (
          <div className="mt-8 flex flex-col gap-4 rounded-xl border border-zinc-200 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <div>
              <h3 className="font-medium">Keep track of the repositories you care about</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                A free account adds bookmarks, search history, side-by-side comparison of up to four repositories, alerts and report export.
              </p>
            </div>
            <div className="flex gap-2">
              <Link to="/login" className={buttonClass('secondary')}>
                Sign in
              </Link>
              <Link to="/register" className={buttonClass('primary')}>
                Create account
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
