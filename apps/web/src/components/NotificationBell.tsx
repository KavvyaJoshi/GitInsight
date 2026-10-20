import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, BellOff, Star, Tag } from 'lucide-react';
import { api, type NotificationItem } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDismiss } from '../lib/useDismiss';
import { buttonClass } from './ui';

const POLL_MS = 60_000;

/** Unread badge plus a dropdown to read, mark and clear notifications (REQ-PERS-006). */
export function NotificationBell() {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [ringing, setRinging] = useState(false);
  const previous = useRef(0);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const refreshCount = useCallback(() => {
    api<{ unread: number }>('/notifications/unread-count')
      .then(({ unread: count }) => {
        if (count > previous.current) {
          setRinging(true);
          setTimeout(() => setRinging(false), 1000);
        }
        previous.current = count;
        setUnread(count);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    window.addEventListener('focus', refreshCount);
    // Other parts of the app (e.g. creating an alert) can ask the bell to check right away.
    window.addEventListener('gi-notifications', refreshCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshCount);
      window.removeEventListener('gi-notifications', refreshCount);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    api<{ notifications: NotificationItem[]; unread: number }>('/notifications')
      .then((r) => {
        setItems(r.notifications);
        setUnread(r.unread);
        previous.current = r.unread;
      })
      .catch(() => setItems([]));
  }, [open]);

  async function openItem(n: NotificationItem) {
    if (!n.read) {
      await api('/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => undefined);
      setUnread((u) => Math.max(0, u - 1));
      previous.current = Math.max(0, previous.current - 1);
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    await api('/notifications/read', { method: 'POST', body: {} });
    setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
    setUnread(0);
    previous.current = 0;
  }

  async function clearAll() {
    await api('/notifications', { method: 'DELETE' });
    setItems([]);
    setUnread(0);
    previous.current = 0;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={`${buttonClass('ghost', 'sm')} relative w-8 px-0`}
      >
        <Bell className={`size-4 ${ringing ? 'bell-ring' : ''}`} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
            <p className="text-sm font-medium">Notifications</p>
            {items && items.length > 0 && (
              <div className="flex gap-3 text-xs text-zinc-500">
                <button onClick={markAll} className="hover:text-zinc-900 dark:hover:text-zinc-100" disabled={unread === 0}>
                  Mark all read
                </button>
                <button onClick={clearAll} className="hover:text-red-600">
                  Clear
                </button>
              </div>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!items && <li className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</li>}
            {items?.length === 0 && (
              <li className="px-6 py-8 text-center">
                <BellOff className="mx-auto size-5 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-2 text-sm font-medium">You’re all caught up</p>
                <p className="mt-1 text-xs text-zinc-500">Set an alert on any repository to hear about star milestones and new releases.</p>
              </li>
            )}
            {items?.map((n) => {
              const Icon = n.kind === 'new_release' ? Tag : Star;
              return (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                    <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${n.read ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'}`}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read ? 'text-zinc-600 dark:text-zinc-400' : 'font-medium'}`}>{n.title}</span>
                      <span className="block text-xs text-zinc-500">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-400">{relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link to="/library?tab=alerts" onClick={close} className="block border-t border-zinc-100 px-4 py-2.5 text-center text-xs text-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:hover:text-zinc-100">
            Manage alerts
          </Link>
        </div>
      )}
    </div>
  );
}
