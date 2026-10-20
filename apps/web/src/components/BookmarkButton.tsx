import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Bookmark, BookmarkCheck, Check, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError, type CollectionItem, type RepositoryMetadata } from '../lib/api';
import { useDismiss } from '../lib/useDismiss';
import { useToast } from './Toast';
import { buttonClass } from './ui';

type Saved = { id: string; collectionId: string };

/** Save a repository into one or more named collections (REQ-PERS-001). Registered users only. */
export function BookmarkButton({ repo }: { repo: RepositoryMetadata }) {
  const { user } = useAuth();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [collections, setCollections] = useState<CollectionItem[] | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  useEffect(() => {
    if (!user) return;
    api<{ bookmarks: Saved[] }>(`/bookmarks?githubId=${repo.id}`)
      .then((r) => setSaved(r.bookmarks))
      .catch(() => undefined);
  }, [user, repo.id]);

  useEffect(() => {
    if (open && !collections) {
      api<{ collections: CollectionItem[] }>('/collections')
        .then((r) => setCollections(r.collections))
        .catch(() => setCollections([]));
    }
  }, [open, collections]);

  if (!user) return null;

  const fail = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');

  async function toggle(collection: CollectionItem) {
    const existing = saved.find((s) => s.collectionId === collection.id);
    setBusy(true);
    try {
      if (existing) {
        await api(`/bookmarks/${existing.id}`, { method: 'DELETE' });
        setSaved((list) => list.filter((s) => s.id !== existing.id));
        toast(`Removed from ${collection.name}`);
      } else {
        const res = await api<{ bookmark: Saved }>('/bookmarks', { method: 'POST', body: { githubId: repo.id, collectionId: collection.id } });
        setSaved((list) => [...list, res.bookmark]);
        toast(`Saved to ${collection.name}`);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function createAndSave(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await api<{ bookmark: Saved }>('/bookmarks', { method: 'POST', body: { githubId: repo.id, newCollectionName: name } });
      setSaved((list) => [...list, res.bookmark]);
      setCollections(null); // refetch so the new shelf appears
      setNewName('');
      toast(`Saved to ${name}`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const isSaved = saved.length > 0;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={buttonClass(isSaved ? 'primary' : 'secondary', 'sm')}>
        {isSaved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
        {isSaved ? 'Saved' : 'Save'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Save to collection"
          className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="px-2 pt-1 pb-2 text-xs font-medium text-zinc-500">Save to a shelf</p>
          {!collections && <p className="px-2 py-3 text-sm text-zinc-500">Loading…</p>}
          {collections?.length === 0 && <p className="px-2 pb-2 text-sm text-zinc-500">No shelves yet. Name your first one below.</p>}
          <ul className="max-h-56 overflow-y-auto">
            {collections?.map((c) => {
              const inIt = saved.some((s) => s.collectionId === c.id);
              return (
                <li key={c.id}>
                  <button
                    disabled={busy}
                    onClick={() => toggle(c)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800"
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded border ${
                        inIt ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {inIt && <Check className="size-3" />}
                    </span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-zinc-400 tabular-nums">{c.bookmarks.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <form onSubmit={createAndSave} className="mt-1 flex gap-1.5 border-t border-zinc-100 px-1 pt-2 dark:border-zinc-800">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New shelf name"
              maxLength={60}
              aria-label="New shelf name"
              className="h-8 min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700"
            />
            <button type="submit" disabled={busy || !newName.trim()} className={buttonClass('secondary', 'sm')} aria-label="Create shelf and save">
              <Plus className="size-3.5" />
            </button>
          </form>
          <Link to="/library" className="mt-2 block rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            Open your library →
          </Link>
        </div>
      )}
    </div>
  );
}
