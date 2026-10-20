import type { ReactNode } from 'react';
import { Archive, CircleDot, Eye, GitFork, Link2, Star } from 'lucide-react';
import type { RepositoryMetadata } from '../../lib/api';
import { compactNumber, exactNumber, formatDate, formatSize, languageColor, relativeTime } from '../../lib/format';

const NOT_SPECIFIED = <span className="font-normal text-zinc-400">Not specified</span>;

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: number | null; note?: string }) {
  return (
    <div className="bg-white px-5 py-4 dark:bg-zinc-950">
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums" title={value === null ? undefined : exactNumber(value)}>
        {value === null ? <span className="text-base text-zinc-400">Not specified</span> : compactNumber(value)}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-zinc-400">{note}</p>}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 sm:block sm:py-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-right text-sm font-medium sm:mt-1 sm:text-left">{children}</dd>
    </div>
  );
}

function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </span>
  );
}

/** Repository metadata on a single card (REQ-DASH-003), with placeholders for missing fields (REQ-DASH-004). */
export function OverviewCard({ repo }: { repo: RepositoryMetadata }) {
  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Flag>Public</Flag>
          {repo.archived && (
            <Flag>
              <Archive className="size-3" /> Archived
            </Flag>
          )}
          {repo.isFork && (
            <Flag>
              <GitFork className="size-3" /> Fork
            </Flag>
          )}
        </div>
        <p className={`mt-4 max-w-3xl text-[15px] leading-relaxed ${repo.description ? '' : 'text-zinc-400'}`}>
          {repo.description ?? 'No description specified.'}
        </p>
        {repo.homepage && (
          <a
            href={repo.homepage.startsWith('http') ? repo.homepage : `https://${repo.homepage}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            <Link2 className="size-4" />
            {repo.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        )}
        {repo.topics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {repo.topics.map((topic) => (
              <span key={topic} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-zinc-200 bg-zinc-200 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
        <Stat icon={<Star className="size-3.5" />} label="Stars" value={repo.stars} />
        <Stat icon={<GitFork className="size-3.5" />} label="Forks" value={repo.forks} />
        <Stat icon={<Eye className="size-3.5" />} label="Watchers" value={repo.watchers} />
        <Stat icon={<CircleDot className="size-3.5" />} label="Open issues" value={repo.openIssues} note="GitHub’s count, includes pull requests" />
      </div>

      <dl className="grid divide-y divide-zinc-100 px-6 py-3 sm:grid-cols-3 sm:gap-6 sm:divide-y-0 sm:py-6 lg:grid-cols-6 dark:divide-zinc-800">
        <Detail label="Owner">
          <a href={repo.owner.url} target="_blank" rel="noreferrer" className="hover:underline">
            {repo.owner.login}
          </a>
          <span className="ml-1 text-xs font-normal text-zinc-400">{repo.owner.type === 'Organization' ? 'org' : 'user'}</span>
        </Detail>
        <Detail label="Primary language">
          {repo.language ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: languageColor(repo.language) }} />
              {repo.language}
            </span>
          ) : (
            NOT_SPECIFIED
          )}
        </Detail>
        <Detail label="License">
          {repo.license ? <span title={repo.license.name}>{repo.license.spdxId ?? repo.license.name}</span> : NOT_SPECIFIED}
        </Detail>
        <Detail label="Size">{formatSize(repo.sizeKb)}</Detail>
        <Detail label="Created">{formatDate(repo.createdAt)}</Detail>
        <Detail label="Last push">
          {repo.pushedAt ? <span title={formatDate(repo.pushedAt)}>{relativeTime(repo.pushedAt)}</span> : NOT_SPECIFIED}
        </Detail>
      </dl>
    </article>
  );
}

export function OverviewSkeleton() {
  const bar = 'animate-pulse rounded bg-zinc-100 dark:bg-zinc-800';
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800" aria-hidden>
      <div className="space-y-3 p-6">
        <div className={`${bar} h-5 w-16`} />
        <div className={`${bar} h-4 w-3/4`} />
        <div className={`${bar} h-4 w-1/2`} />
      </div>
      <div className="grid grid-cols-2 gap-px border-y border-zinc-200 bg-zinc-200 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 bg-white px-5 py-4 dark:bg-zinc-950">
            <div className={`${bar} h-3 w-12`} />
            <div className={`${bar} h-7 w-20`} />
          </div>
        ))}
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className={`${bar} h-3 w-14`} />
            <div className={`${bar} h-4 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}
