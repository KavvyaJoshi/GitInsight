import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { onServerStatus, type ServerStatus } from '../lib/api';

type Tone = 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

const cardClass =
  'pointer-events-auto flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus>('unknown');
  const lastStatus = useRef<ServerStatus>('unknown');

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(
    () =>
      onServerStatus((status) => {
        if (lastStatus.current === 'waking' && status === 'ready') push('The server is awake. Loading your data…');
        if (status === 'down') push('The server didn’t start. Please refresh the page in a minute.', 'error');
        lastStatus.current = status;
        setServerStatus(status);
      }),
    [push],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
        {serverStatus === 'waking' && (
          <div role="status" className={`${cardClass} max-w-sm items-start`}>
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-zinc-400" aria-hidden />
            <div>
              <p className="font-medium">Waking up the server…</p>
              <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                The GitInsight API runs on Render’s free plan, which sleeps when idle. Starting up can take up to a minute. Everything will load on its own,
                so there’s no need to refresh.
              </p>
            </div>
          </div>
        )}
        {toasts.map((t) => (
          <div key={t.id} className={cardClass}>
            {t.tone === 'success' ? (
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
            ) : (
              <AlertCircle className="size-4 text-red-500" aria-hidden />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
