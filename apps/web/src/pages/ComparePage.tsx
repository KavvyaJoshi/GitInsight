import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Crown, Layers, Lock, Plus, RotateCw, Save, Sparkles, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ShufflingDeck, TradingCard, type Bests } from '../components/compare/TradingCard';
import { useToast } from '../components/Toast';
import { Alert, Button, buttonClass } from '../components/ui';
import {
  api,
  ApiError,
  type CollectionItem,
  type ComparisonEntry,
  type ComparisonNarrative,
  type ComparisonSetItem,
  type HistoryEntry,
  type RepositoryMetadata,
} from '../lib/api';
import { compactNumber, exactNumber, formatDate, languageColor, relativeTime } from '../lib/format';
import { parseRepoRef } from '../lib/repoRef';

const MAX = 4;
const MAX_POLLS = 5;

// ---- Picker ----

function RepoPicker({ selected, onChange, suggestions }: { selected: string[]; onChange: (next: string[]) => void; suggestions: string[] }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const full = selected.length >= MAX;
  const has = (name: string) => selected.some((s) => s.toLowerCase() === name.toLowerCase());

  function add(input: string) {
    const ref = parseRepoRef(input);
    if (!ref.ok) return setError(ref.error);
    const name = `${ref.value.owner}/${ref.value.repo}`;
    if (has(name)) return setError(`${name} is already on the table.`);
    if (full) return setError('You can compare up to four repositories at a time.');
    setError(null);
    setValue('');
    onChange([...selected, name]);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    add(value);
  }

  const quick = suggestions.filter((s) => !has(s)).slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((name, i) => (
          <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white py-1 pr-1.5 pl-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <span className="text-xs text-zinc-400">{i + 1}</span>
            {name}
            <button onClick={() => onChange(selected.filter((s) => s !== name))} aria-label={`Remove ${name}`} className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <form onSubmit={submit} className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            disabled={full}
            placeholder={full ? 'Table is full (4 max)' : selected.length ? 'Add another owner/repo' : 'owner/repo'}
            aria-label="Add a repository to compare"
            spellCheck={false}
            className="h-9 w-56 rounded-full border border-dashed border-zinc-300 bg-transparent px-4 font-mono text-sm outline-none placeholder:font-sans focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          />
          <button type="submit" disabled={full || !value.trim()} className={`${buttonClass('secondary', 'sm')} h-9 rounded-full`} aria-label="Add repository">
            <Plus className="size-4" />
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {quick.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-zinc-500">From your library</span>
          {quick.map((s) => (
            <button key={s} onClick={() => add(s)} className="rounded-md border border-zinc-200 px-2 py-0.5 font-mono text-[12.5px] text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Head to head ----

type Row = { label: string; value: (r: RepositoryMetadata, e: ComparisonEntry) => ReactNode; score?: (r: RepositoryMetadata, e: ComparisonEntry) => number | null };

const ROWS: Row[] = [
  { label: 'Health score', value: (_, e) => e.health?.score ?? '—', score: (_, e) => e.health?.score ?? null },
  { label: 'Stars', value: (r) => exactNumber(r.stars), score: (r) => r.stars },
  { label: 'Forks', value: (r) => exactNumber(r.forks), score: (r) => r.forks },
  { label: 'Watchers', value: (r) => (r.watchers === null ? 'Not specified' : exactNumber(r.watchers)), score: (r) => r.watchers },
  { label: 'Open issues & PRs', value: (r) => exactNumber(r.openIssues) },
  { label: 'Last push', value: (r) => (r.pushedAt ? relativeTime(r.pushedAt) : '—'), score: (r) => (r.pushedAt ? Date.parse(r.pushedAt) : null) },
  { label: 'Created', value: (r) => formatDate(r.createdAt) },
  { label: 'Primary language', value: (r) => r.language ?? 'Not specified' },
  { label: 'License', value: (r) => r.license?.spdxId ?? r.license?.name ?? 'Not specified' },
];

function HeadToHead({ entries }: { entries: ComparisonEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/60">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Head to head</th>
            {entries.map((e) => (
              <th key={e.repository.id} className="px-4 py-2.5 text-left font-mono font-medium">
                {e.repository.fullName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {ROWS.map((row) => {
            const scores = row.score ? entries.map((e) => row.score!(e.repository, e)) : [];
            const max = scores.length ? Math.max(...scores.filter((s): s is number => s !== null)) : null;
            return (
              <tr key={row.label}>
                <td className="px-4 py-2.5 text-zinc-500">{row.label}</td>
                {entries.map((e, i) => {
                  const best = max !== null && Number.isFinite(max) && scores[i] === max && scores.filter((s) => s === max).length < entries.length;
                  return (
                    <td key={e.repository.id} className={`px-4 py-2.5 ${best ? 'font-semibold' : ''}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {row.value(e.repository, e)}
                        {best && <Crown className="size-3.5 fill-amber-400 text-amber-500" aria-label="Best" />}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Language mix ----

function LanguageMix({ entries }: { entries: ComparisonEntry[] }) {
  const legend = [...new Set(entries.flatMap((e) => (e.languages ?? []).map((l) => l.name)))];
  const colorOf = (name: string) => (name === 'Other' ? 'var(--chart-other)' : languageColor(name));

  return (
    <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="font-medium">Language mix</h2>
      <p className="mt-0.5 text-sm text-zinc-500">Share of each codebase by language. The same language has the same colour everywhere.</p>
      <div className="mt-5 space-y-4">
        {entries.map((e) => (
          <div key={e.repository.id} className="grid items-center gap-2 sm:grid-cols-[12rem_1fr]">
            <span className="truncate font-mono text-sm">{e.repository.fullName}</span>
            {e.languages?.length ? (
              <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">
                {e.languages.map((l) => (
                  <span key={l.name} title={`${l.name} ${l.percent.toFixed(1)}%`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${l.percent}%`, backgroundColor: colorOf(l.name) }} />
                ))}
              </div>
            ) : (
              <span className="text-sm text-zinc-400">No language data</span>
            )}
          </div>
        ))}
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        {legend.map((name) => (
          <li key={name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(name) }} />
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- AI narrative ----

function Narrative({ githubIds }: { githubIds: number[] }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: ComparisonNarrative }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const key = githubIds.join(',');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api<{ data: ComparisonNarrative }>('/comparisons/narrative', { method: 'POST', body: { githubIds: key.split(',').map(Number) } })
      .then((r) => !cancelled && setState({ status: 'ready', data: r.data }))
      .catch((err) => !cancelled && setState({ status: 'error', message: err instanceof ApiError ? err.message : 'The AI narrative could not be loaded.' }));
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  return (
    <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <h2 className="font-medium">The verdict</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
          <Sparkles className="size-3.5" aria-hidden /> AI-generated
        </span>
      </div>
      {state.status === 'loading' && (
        <div className="mt-4 space-y-2" aria-label="Writing the comparison">
          {[90, 75, 82].map((w) => (
            <div key={w} className="h-3.5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {state.status === 'error' && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
          {state.message}
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw className="size-3.5" /> Retry
          </Button>
        </div>
      )}
      {state.status === 'ready' && !state.data.available && <p className="mt-4 text-sm text-zinc-500">{state.data.message}</p>}
      {state.status === 'ready' && state.data.available && (
        <>
          <p className="mt-4 max-w-3xl leading-relaxed text-pretty">{state.data.narrative}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {state.data.bestFor.map((b) => (
              <li key={b.repository} className="rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                <p className="font-mono text-xs text-zinc-500">{b.repository}</p>
                <p className="mt-1 text-sm">Best for {b.useCase.charAt(0).toLowerCase() + b.useCase.slice(1)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">
            Written by {state.data.model} from {state.data.sources.join(' and ')}. AI can make mistakes; the cards and table above come straight from GitHub.
          </p>
        </>
      )}
    </section>
  );
}

// ---- Page ----

function GuestTeaser() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="relative mx-auto h-36 w-56">
        {[-14, 0, 14].map((rot, i) => (
          <div
            key={rot}
            className="absolute top-0 left-1/2 flex h-36 w-24 items-center justify-center rounded-xl border-4 border-white bg-zinc-900 shadow-lg dark:border-zinc-800"
            style={{ transform: `translateX(-50%) translateX(${(i - 1) * 46}px) rotate(${rot}deg)` }}
          >
            <Lock className="size-6 text-zinc-500" />
          </div>
        ))}
      </div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Compare repositories head to head</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Put two to four repositories on the table as trading cards, see who wins each stat, and get an AI verdict. Comparison is part of a free account.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/login" state={{ from: '/compare' }} className={buttonClass('secondary')}>
          Sign in
        </Link>
        <Link to="/register" state={{ from: '/compare' }} className={buttonClass('primary')}>
          Create account
        </Link>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const selected = useMemo(() => (params.get('repos') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX), [params]);
  const setSelected = useCallback((next: string[]) => setParams(next.length ? { repos: next.join(',') } : {}, { replace: true }), [setParams]);

  const [result, setResult] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; repos: ComparisonEntry[] }>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const [sets, setSets] = useState<ComparisonSetItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [setName, setSetName] = useState('');

  const loadSets = useCallback(() => {
    api<{ sets: ComparisonSetItem[] }>('/comparison-sets')
      .then((r) => setSets(r.sets))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSets();
    Promise.all([
      api<{ collections: CollectionItem[] }>('/collections').catch(() => ({ collections: [] })),
      api<{ entries: HistoryEntry[] }>('/history?limit=30').catch(() => ({ entries: [] })),
    ]).then(([c, h]) => setSuggestions([...new Set([...c.collections.flatMap((x) => x.bookmarks.map((b) => b.fullName)), ...h.entries.map((e) => e.fullName)])]));
  }, [user, loadSets]);

  const key = selected.join(',');
  useEffect(() => {
    if (!user || selected.length < 2) {
      setResult({ status: 'idle' });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    setResult({ status: 'loading' });
    const load = async () => {
      try {
        const res = await api<{ repos: ComparisonEntry[] }>('/comparisons', { method: 'POST', body: { repos: key.split(',') } });
        if (cancelled) return;
        setResult({ status: 'ready', repos: res.repos });
        // GitHub may still be computing stats for a newly seen repository; check back shortly.
        if (res.repos.some((r) => r.healthPending) && ++polls <= MAX_POLLS) timer = setTimeout(load, 6000);
      } catch (err) {
        if (!cancelled) setResult({ status: 'error', message: err instanceof ApiError ? err.message : 'The comparison could not be loaded.' });
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key, attempt]);

  if (!loading && !user) return <GuestTeaser />;

  const entries = result.status === 'ready' ? result.repos : [];
  const scores = entries.map((e) => e.health?.score ?? null);
  const top = Math.max(...scores.filter((s): s is number => s !== null));
  const championId = Number.isFinite(top) && scores.filter((s) => s === top).length === 1 ? entries[scores.indexOf(top)].repository.id : null;
  const bests: Bests = {};
  for (const e of entries) {
    for (const c of e.health?.components ?? []) {
      if (c.score !== null && (bests[c.key] === undefined || c.score > bests[c.key]!)) bests[c.key] = c.score;
    }
  }

  async function saveSet(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/comparison-sets', { method: 'POST', body: { name: setName.trim(), githubIds: entries.map((x) => x.repository.id) } });
      toast(`Saved “${setName.trim()}”`);
      setSetName('');
      loadSets();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save this comparison.', 'error');
    }
  }

  async function deleteSet(set: ComparisonSetItem) {
    await api(`/comparison-sets/${set.id}`, { method: 'DELETE' }).catch(() => undefined);
    loadSets();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Compare repositories</h1>
      <p className="mt-1 text-sm text-zinc-500">Put two to four repositories on the table. Crowns mark the best value for each stat.</p>

      {sets.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Saved matchups</span>
          {sets.map((s) => (
            <span key={s.id} className="group inline-flex items-center rounded-md border border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setSelected(s.repos)} className="px-2.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900" title={s.repos.join(' vs ')}>
                <Layers className="mr-1.5 inline size-3.5 text-zinc-400" />
                {s.name} <span className="text-zinc-400">· {s.repos.length}</span>
              </button>
              <button onClick={() => deleteSet(s)} aria-label={`Delete ${s.name}`} className="border-l border-zinc-200 px-1.5 py-1 text-zinc-400 hover:text-red-600 dark:border-zinc-800">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-6">
        <RepoPicker selected={selected} onChange={setSelected} suggestions={suggestions} />
      </div>

      <div className="mt-10">
        {result.status === 'idle' && (
          <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700">
            {selected.length === 0 ? 'Add at least two repositories to deal the cards.' : 'Add one more repository to deal the cards.'}
          </div>
        )}
        {result.status === 'loading' && <ShufflingDeck count={selected.length} />}
        {result.status === 'error' && (
          <div className="space-y-3">
            <Alert>{result.message}</Alert>
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw className="size-3.5" /> Try again
            </Button>
          </div>
        )}
        {result.status === 'ready' && (
          <div className="space-y-8">
            <div className={`grid gap-5 sm:grid-cols-2 ${entries.length === 3 ? 'lg:grid-cols-3' : entries.length === 4 ? 'lg:grid-cols-4' : ''}`}>
              {entries.map((e, i) => (
                <Link key={e.repository.id} to={`/${e.repository.fullName}`} className="block rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                  <TradingCard entry={e} index={i} total={entries.length} champion={e.repository.id === championId} bests={bests} />
                </Link>
              ))}
            </div>

            <form onSubmit={saveSet} className="flex flex-wrap items-center gap-2">
              <input
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="Name this matchup to save it"
                maxLength={60}
                aria-label="Comparison name"
                className="h-9 w-64 rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={!setName.trim()} className="h-9">
                <Save className="size-3.5" /> Save matchup
              </Button>
              <span className="text-xs text-zinc-400">
                Total stars on the table: {compactNumber(entries.reduce((s, e) => s + e.repository.stars, 0))}
              </span>
            </form>

            <Narrative githubIds={entries.map((e) => e.repository.id)} />
            <HeadToHead entries={entries} />
            <LanguageMix entries={entries} />
          </div>
        )}
      </div>
    </div>
  );
}
