import { Crown, Star, Users, Wrench, Zap, GitFork } from 'lucide-react';
import type { ComparisonEntry, HealthComponent } from '../../lib/api';
import { compactNumber, languageColor } from '../../lib/format';
import { LogoMark } from '../Logo';

const STAT_ICONS: Record<HealthComponent['key'], typeof Zap> = { activity: Zap, community: Users, maintenance: Wrench, popularity: Star };
export type Bests = Partial<Record<HealthComponent['key'], number>>;

/**
 * A repository as a collectible card: HP is the health score, the "type" is its language,
 * the four health signals are its stats, and a crown marks the best value on the table.
 */
export function TradingCard({ entry, index, total, champion, bests }: { entry: ComparisonEntry; index: number; total: number; champion: boolean; bests: Bests }) {
  const repo = entry.repository;
  const color = repo.language ? languageColor(repo.language) : '#a1a1aa';
  const hp = entry.health?.score ?? null;

  return (
    <div className="card-deal h-full" style={{ animationDelay: `${index * 140}ms` }}>
      <div
        className={`h-full rounded-[18px] p-[3px] transition-transform duration-300 hover:-translate-y-1.5 hover:rotate-[0.6deg] ${
          champion ? 'holo' : 'bg-zinc-200 dark:bg-zinc-700'
        }`}
      >
        <article className="relative flex h-full flex-col overflow-hidden rounded-[15px] bg-white dark:bg-zinc-900">
          {champion && (
            <span className="absolute top-3 -right-9 z-10 rotate-45 bg-amber-400 px-10 py-0.5 text-[10px] font-bold tracking-widest text-amber-950 uppercase shadow">
              Champion
            </span>
          )}

          <header className="flex items-start justify-between gap-2 px-4 pt-3.5">
            <div className="min-w-0">
              <p className="truncate font-mono text-[11px] text-zinc-500">{repo.owner.login}</p>
              <h3 className="truncate font-mono text-base font-semibold">{repo.name}</h3>
            </div>
            <div className="shrink-0 text-right leading-none">
              <span className="text-[10px] font-bold text-zinc-500">HP </span>
              <span className="font-mono text-2xl font-bold tabular-nums">{entry.healthPending ? '…' : (hp ?? '?')}</span>
            </div>
          </header>

          {/* Card art: the owner's avatar on a field tinted with the language colour. */}
          <div
            className="relative mx-3 mt-2 flex aspect-[5/3] items-center justify-center overflow-hidden rounded-lg border border-black/5"
            style={{
              background: `radial-gradient(circle at 50% 40%, ${color}55, transparent 70%), repeating-linear-gradient(45deg, ${color}22 0 6px, transparent 6px 12px)`,
            }}
          >
            {repo.owner.avatarUrl ? (
              <img src={repo.owner.avatarUrl} alt="" className="size-20 rounded-full border-4 border-white shadow-lg dark:border-zinc-900" />
            ) : (
              <LogoMark className="size-16" />
            )}
            {champion && <Crown className="absolute top-2 left-1/2 size-6 -translate-x-1/2 fill-amber-400 text-amber-500 drop-shadow" aria-label="Champion" />}
          </div>

          <p className="mx-3 mt-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600 italic dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="mr-1.5 inline-block size-2 rounded-full not-italic" style={{ backgroundColor: color }} />
            {repo.language ?? 'Unknown'} type · {repo.owner.type === 'Organization' ? 'Organisation' : 'Solo'} trainer
          </p>

          <ul className="mt-3 space-y-2 px-4">
            {(entry.health?.components ?? []).map((c) => {
              const Icon = STAT_ICONS[c.key];
              const best = total > 1 && c.score !== null && bests[c.key] === c.score;
              return (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  <Icon className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                  <span className="w-20 shrink-0">{c.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    {c.score !== null && <span className="block h-full rounded-full" style={{ width: `${c.score}%`, backgroundColor: 'var(--chart-accent)' }} />}
                  </span>
                  <span className="w-7 text-right font-mono tabular-nums">{c.score ?? '—'}</span>
                  <Crown className={`size-3.5 shrink-0 ${best ? 'fill-amber-400 text-amber-500' : 'invisible'}`} aria-label={best ? 'Best on the table' : undefined} />
                </li>
              );
            })}
            {!entry.health && <li className="text-xs text-zinc-500">{entry.healthPending ? 'GitHub is still preparing stats…' : 'Stats unavailable.'}</li>}
          </ul>

          <p className="mx-4 mt-3 line-clamp-2 flex-1 text-xs text-zinc-500 italic">{repo.description ?? 'A mysterious repository with no description.'}</p>

          <footer className="mt-3 flex items-center gap-3 border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800">
            <span className="flex items-center gap-1">
              <Star className="size-3" /> {compactNumber(repo.stars)}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="size-3" /> {compactNumber(repo.forks)}
            </span>
            <span>Est. {repo.createdAt.slice(0, 4)}</span>
            <span className="ml-auto font-mono">
              {index + 1}/{total}
            </span>
          </footer>
        </article>
      </div>
    </div>
  );
}

/** Face-down cards shuffling while the comparison loads. */
export function ShufflingDeck({ count }: { count: number }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-6" role="status">
      <div className="relative h-40 w-28">
        {Array.from({ length: Math.max(2, count) }, (_, i) => (
          <div
            key={i}
            className="card-shuffle absolute inset-0 flex items-center justify-center rounded-xl border-4 border-white bg-zinc-900 shadow-lg dark:border-zinc-800"
            style={{
              ['--dx' as string]: `${(i % 2 ? 1 : -1) * (24 + i * 6)}px`,
              ['--rot' as string]: `${(i % 2 ? 1 : -1) * (8 + i * 3)}deg`,
              animationDelay: `${i * 120}ms`,
              backgroundImage: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.06) 0 8px, transparent 8px 16px)',
            }}
          >
            <LogoMark className="size-10" />
          </div>
        ))}
      </div>
      <p className="text-sm text-zinc-500">Shuffling the deck. This takes a few seconds the first time a repository is compared.</p>
    </div>
  );
}
