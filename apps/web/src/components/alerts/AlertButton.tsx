import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BellPlus, BellRing, Star, Tag, Trash2 } from 'lucide-react';
import { api, ApiError, type AlertItem, type RepositoryMetadata } from '../../lib/api';
import { exactNumber } from '../../lib/format';
import { useDismiss } from '../../lib/useDismiss';
import { useToast } from '../Toast';
import { Button, buttonClass } from '../ui';
import { RocketProgress, nextMilestone } from './RocketProgress';

/** Create star-milestone and new-release alerts for this repository (REQ-PERS-004). */
export function AlertButton({ repo }: { repo: RepositoryMetadata }) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [threshold, setThreshold] = useState(String(nextMilestone(repo.stars)));
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const load = useCallback(() => {
    api<{ alerts: AlertItem[] }>('/alerts')
      .then((r) => setAlerts(r.alerts.filter((a) => a.githubId === repo.id)))
      .catch(() => undefined);
  }, [repo.id]);
  useEffect(load, [load]);

  async function create(body: { type: AlertItem['type']; threshold?: number }) {
    setBusy(true);
    try {
      const { alert } = await api<{ alert: AlertItem }>('/alerts', { method: 'POST', body: { githubId: repo.id, ...body } });
      toast(alert.type === 'new_release' ? 'You’ll hear about new releases' : alert.triggered ? 'Already there! Check your notifications' : `Watching for ${exactNumber(alert.threshold!)} stars`);
      window.dispatchEvent(new Event('gi-notifications'));
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create the alert.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(alert: AlertItem) {
    await api(`/alerts/${alert.id}`, { method: 'DELETE' }).catch(() => undefined);
    load();
  }

  function submitThreshold(e: FormEvent) {
    e.preventDefault();
    const value = Number(threshold);
    if (Number.isInteger(value) && value > 0) create({ type: 'star_threshold', threshold: value });
  }

  const hasRelease = alerts.some((a) => a.type === 'new_release');
  const goal = Number(threshold) || nextMilestone(repo.stars);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={buttonClass('secondary', 'sm')}>
        {alerts.length ? <BellRing className="size-3.5" /> : <BellPlus className="size-3.5" />}
        {alerts.length ? `Alerts · ${alerts.length}` : 'Alert'}
      </button>

      {open && (
        <div role="dialog" aria-label="Alerts for this repository" className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900">
          <form onSubmit={submitThreshold}>
            <label htmlFor="alert-threshold" className="flex items-center gap-1.5 text-sm font-medium">
              <Star className="size-3.5 text-amber-500" /> Tell me when stars reach
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="alert-threshold"
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 font-mono text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
              />
              <Button type="submit" size="sm" loading={busy} className="h-9">
                Watch
              </Button>
            </div>
            <RocketProgress current={repo.stars} goal={goal} />
          </form>

          <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <Button variant="secondary" size="sm" className="w-full" disabled={busy || hasRelease} onClick={() => create({ type: 'new_release' })}>
              <Tag className="size-3.5" /> {hasRelease ? 'Watching for new releases' : 'Tell me about new releases'}
            </Button>
          </div>

          {alerts.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  {a.type === 'new_release' ? <Tag className="size-3.5 text-zinc-400" /> : <Star className="size-3.5 text-zinc-400" />}
                  <span className="flex-1 truncate">
                    {a.type === 'new_release' ? `New releases${a.lastReleaseTag ? ` (latest ${a.lastReleaseTag})` : ''}` : `${exactNumber(a.threshold!)} stars`}
                    {a.triggered && <span className="ml-1.5 text-xs text-amber-600">reached</span>}
                  </span>
                  <button onClick={() => remove(a)} aria-label="Delete alert" className="rounded p-1 text-zinc-400 hover:text-red-600">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-zinc-500">
            Checked automatically in the background.{' '}
            <Link to="/library?tab=alerts" className="underline-offset-2 hover:underline">
              Manage all alerts
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
