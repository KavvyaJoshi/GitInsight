import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Clock, Layers, Pause, Pencil, Play, Plus, Rocket, Star, Tag, Trash2, X } from 'lucide-react';
import { RocketProgress } from '../components/alerts/RocketProgress';
import { useToast } from '../components/Toast';
import { Alert, Button, Spinner, buttonClass } from '../components/ui';
import { api, ApiError, type AlertItem, type BookmarkItem, type CollectionItem, type HistoryEntry } from '../lib/api';
import { compactNumber, formatTime, languageColor, relativeTime } from '../lib/format';

// ---- Shelves ----

/** Dark text on light spines, light text on dark spines. */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#18181b' : '#ffffff';
}

function BookSpine({ book, onRemove }: { book: BookmarkItem; onRemove: () => void }) {
  const color = book.language ? languageColor(book.language) : '#71717a';
  const ink = inkFor(color);
  // More stars, taller book: logarithmic so a 200k-star giant still fits on the shelf.
  const height = Math.round(Math.min(176, 104 + 14 * Math.log10(book.stars + 1)));
  const name = book.fullName.split('/')[1];

  return (
    <div className="group relative shrink-0">
      <Link
        to={`/${book.fullName}`}
        title={`${book.fullName}${book.description ? `: ${book.description}` : ''}`}
        className="book relative flex flex-col items-center justify-between overflow-hidden rounded-t-sm rounded-b-xs py-2 outline-none"
        style={{ height, width: name.length > 16 ? 46 : 40, backgroundColor: color, color: ink }}
      >
        <span className="h-1 w-full opacity-40" style={{ backgroundColor: ink }} />
        <span className="max-h-full flex-1 overflow-hidden py-1.5 font-mono text-[12px] font-medium tracking-wide whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
          {name}
        </span>
        <span className="text-[9px] font-semibold opacity-80">★{compactNumber(book.stars)}</span>
        <span className="mt-1 h-1 w-full opacity-40" style={{ backgroundColor: ink }} />
        {/* Light from the left gives the spine some roundness. */}
        <span className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-white/20" />
      </Link>
      <button
        onClick={onRemove}
        aria-label={`Remove ${book.fullName} from this shelf`}
        className="absolute -top-2 -right-2 z-10 hidden size-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow group-focus-within:flex group-hover:flex hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function PottedPlant() {
  return (
    <svg viewBox="0 0 40 60" className="h-16 w-11 shrink-0" aria-hidden>
      <path d="M20,34 C12,24 6,26 4,16 C14,16 18,24 20,34 Z" fill="var(--chart-accent)" />
      <path d="M20,34 C26,22 34,22 37,12 C26,13 22,22 20,34 Z" fill="var(--chart-accent)" opacity={0.75} />
      <path d="M20,36 C19,24 21,12 20,4" stroke="var(--chart-accent)" strokeWidth={2} fill="none" />
      <path d="M9,36 h22 l-3,22 h-16 z" fill="var(--tree-bark)" />
      <rect x={7} y={34} width={26} height={5} rx={1.5} fill="var(--tree-bark-dark)" />
    </svg>
  );
}

function Shelf({ collection, onChange }: { collection: CollectionItem; onChange: () => void }) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(collection.name);

  const fail = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/collections/${collection.id}`, { method: 'PATCH', body: { name } });
      setRenaming(false);
      onChange();
    } catch (err) {
      fail(err);
    }
  }

  async function remove() {
    if (!confirm(`Delete the “${collection.name}” shelf and its ${collection.bookmarks.length} bookmark(s)?`)) return;
    try {
      await api(`/collections/${collection.id}`, { method: 'DELETE' });
      toast(`Deleted ${collection.name}`);
      onChange();
    } catch (err) {
      fail(err);
    }
  }

  async function removeBook(book: BookmarkItem) {
    try {
      await api(`/bookmarks/${book.id}`, { method: 'DELETE' });
      toast(`Removed ${book.fullName}`);
      onChange();
    } catch (err) {
      fail(err);
    }
  }

  const compareHref = `/compare?repos=${collection.bookmarks
    .slice(0, 4)
    .map((b) => encodeURIComponent(b.fullName))
    .join(',')}`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {renaming ? (
          <form onSubmit={rename} className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              aria-label="Shelf name"
              className="h-8 rounded-md border border-zinc-300 bg-transparent px-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
            />
            <Button size="sm" type="submit">
              Save
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <h2 className="font-medium">{collection.name}</h2>
            <span className="text-sm text-zinc-400 tabular-nums">{collection.bookmarks.length}</span>
            <button onClick={() => setRenaming(true)} aria-label={`Rename ${collection.name}`} className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
              <Pencil className="size-3.5" />
            </button>
            <button onClick={remove} aria-label={`Delete ${collection.name}`} className="rounded p-1 text-zinc-400 hover:text-red-600">
              <Trash2 className="size-3.5" />
            </button>
            {collection.bookmarks.length >= 2 && (
              <Link to={compareHref} className={`${buttonClass('ghost', 'sm')} ml-auto`}>
                <Layers className="size-3.5" /> Compare {Math.min(4, collection.bookmarks.length)}
              </Link>
            )}
          </>
        )}
      </div>

      {/* The shelf: books stand on a wooden plank. */}
      <div className="rounded-lg bg-linear-to-b from-amber-50/60 to-amber-100/40 px-4 pt-6 dark:from-zinc-900 dark:to-zinc-900/40">
        <div className="flex min-h-36 items-end gap-1.5 overflow-x-auto pt-4">
          {collection.bookmarks.length === 0 ? (
            <p className="self-center pb-6 text-sm text-zinc-500">
              This shelf is empty. Open any repository and press <b>Save</b> to put it here.
            </p>
          ) : (
            collection.bookmarks.map((book) => <BookSpine key={book.id} book={book} onRemove={() => removeBook(book)} />)
          )}
          <div className="ml-auto pl-4">
            <PottedPlant />
          </div>
        </div>
        <div className="-mx-4 h-3 rounded-b-lg shadow-[0_6px_10px_-6px_rgb(0_0_0/0.4)]" style={{ backgroundColor: 'var(--tree-bark)' }} />
      </div>
    </section>
  );
}

function Shelves() {
  const toast = useToast();
  const [collections, setCollections] = useState<CollectionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(() => {
    api<{ collections: CollectionItem[] }>('/collections')
      .then((r) => setCollections(r.collections))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your library.'));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/collections', { method: 'POST', body: { name: newName.trim() } });
      setNewName('');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!collections) return <Spinner label="Dusting off the shelves" />;

  return (
    <div className="space-y-10">
      <form onSubmit={create} className="flex max-w-md gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name a new shelf, e.g. “UI libraries”"
          maxLength={60}
          aria-label="New shelf name"
          className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <Button size="sm" type="submit" disabled={!newName.trim()} className="h-9">
          <Plus className="size-4" /> Add shelf
        </Button>
      </form>

      {collections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
          <p className="font-medium">Your library is empty</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            Create a shelf above, or open any repository and press <b>Save</b>. Each repository becomes a book: its colour is its language, its height is its stars.
          </p>
        </div>
      ) : (
        collections.map((c) => <Shelf key={c.id} collection={c} onChange={load} />)
      )}
    </div>
  );
}

// ---- History ----

function dayLabel(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
}

function History() {
  const toast = useToast();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    try {
      const res = await api<{ entries: HistoryEntry[]; hasMore: boolean }>(`/history?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      setEntries((list) => (before ? [...(list ?? []), ...res.entries] : res.entries));
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your history.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(entry: HistoryEntry) {
    await api(`/history/${entry.id}`, { method: 'DELETE' }).catch(() => undefined);
    setEntries((list) => list?.filter((e) => e.id !== entry.id) ?? null);
  }

  async function clearAll() {
    if (!confirm('Clear your whole search history?')) return;
    await api('/history', { method: 'DELETE' });
    setEntries([]);
    setHasMore(false);
    toast('History cleared');
  }

  if (error) return <Alert>{error}</Alert>;
  if (!entries) return <Spinner label="Loading history" />;
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
        <Clock className="mx-auto size-6 text-zinc-400" />
        <p className="mt-3 font-medium">No searches yet</p>
        <p className="mt-1 text-sm text-zinc-500">Repositories you look up while signed in will appear here, newest first.</p>
      </div>
    );
  }

  const groups = new Map<string, HistoryEntry[]>();
  for (const e of entries) groups.set(dayLabel(e.searchedAt), [...(groups.get(dayLabel(e.searchedAt)) ?? []), e]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Your most recent searches. The latest 500 are kept.</p>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <Trash2 className="size-3.5" /> Clear history
        </Button>
      </div>
      {[...groups].map(([label, list]) => (
        <section key={label}>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</h2>
          <ol className="relative space-y-1 border-l border-zinc-200 pl-5 dark:border-zinc-800">
            {list.map((e) => (
              <li key={e.id} className="group relative flex items-center gap-3 rounded-md py-1.5 pr-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <span className="absolute top-1/2 -left-6.25 size-2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-300 dark:border-zinc-950 dark:bg-zinc-600" />
                <span className="w-14 shrink-0 font-mono text-xs text-zinc-400 tabular-nums">{formatTime(e.searchedAt)}</span>
                <Link to={`/${e.fullName}`} className="min-w-0 flex-1 truncate font-mono text-sm hover:underline">
                  {e.fullName}
                </Link>
                <Link
                  to={`/compare?repos=${encodeURIComponent(e.fullName)}`}
                  className="hidden text-xs text-zinc-500 group-hover:inline hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Compare
                </Link>
                <button onClick={() => remove(e)} aria-label={`Remove ${e.fullName} from history`} className="rounded p-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {hasMore && (
        <Button variant="secondary" size="sm" onClick={() => load(entries.at(-1)!.searchedAt)}>
          Load older searches
        </Button>
      )}
    </div>
  );
}

// ---- Alerts ----

function Alerts() {
  const toast = useToast();
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ alerts: AlertItem[] }>('/alerts')
      .then((r) => setAlerts(r.alerts))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your alerts.'));
  }, []);
  useEffect(load, [load]);

  async function toggle(a: AlertItem) {
    await api(`/alerts/${a.id}`, { method: 'PATCH', body: { active: !a.active } }).catch(() => undefined);
    toast(a.active ? 'Alert paused' : 'Alert resumed');
    load();
  }

  async function remove(a: AlertItem) {
    await api(`/alerts/${a.id}`, { method: 'DELETE' }).catch(() => undefined);
    load();
  }

  if (error) return <Alert>{error}</Alert>;
  if (!alerts) return <Spinner label="Loading alerts" />;
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
        <Rocket className="mx-auto size-6 rotate-45 text-zinc-400" />
        <p className="mt-3 font-medium">No alerts yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          Open any repository and press <b>Alert</b> to hear when it reaches a star milestone or publishes a new release.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {alerts.map((a) => (
        <li key={a.id} className={`rounded-xl border border-zinc-200 p-5 dark:border-zinc-800 ${a.active ? '' : 'opacity-60'}`}>
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
              {a.type === 'new_release' ? <Tag className="size-4" /> : <Star className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <Link to={`/${a.fullName}`} className="block truncate font-mono text-sm font-medium hover:underline">
                {a.fullName}
              </Link>
              <p className="text-sm text-zinc-500">
                {a.type === 'new_release' ? 'When a new release is published' : `When stars reach ${a.threshold!.toLocaleString('en')}`}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                !a.active
                  ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
                  : a.triggered
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300'
              }`}
            >
              {!a.active ? 'Paused' : a.triggered ? 'Reached' : 'Watching'}
            </span>
          </div>

          {a.type === 'star_threshold' && <RocketProgress current={a.lastStars} goal={a.threshold!} />}
          {a.type === 'new_release' && (
            <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              Latest release: <span className="font-mono">{a.lastReleaseTag ?? 'none yet'}</span>
            </p>
          )}
          {a.lastError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Last check failed: {a.lastError}</p>}

          <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
            <span>{a.lastCheckedAt ? `Checked ${relativeTime(a.lastCheckedAt)}` : 'Not checked yet'}</span>
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => toggle(a)}>
                {a.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {a.active ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove(a)} aria-label={`Delete alert for ${a.fullName}`}>
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const TABS = [
  { id: 'shelves', label: 'Bookshelves' },
  { id: 'history', label: 'Search history' },
  { id: 'alerts', label: 'Alerts' },
] as const;

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'shelves';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your library</h1>
      <p className="mt-1 text-sm text-zinc-500">Saved repositories and everything you have looked up.</p>
      <div className="mt-6 mb-8 flex gap-1 border-b border-zinc-200 dark:border-zinc-800" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'shelves' ? {} : { tab: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === t.id ? 'border-zinc-900 font-medium dark:border-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'shelves' ? <Shelves /> : tab === 'history' ? <History /> : <Alerts />}
    </div>
  );
}
