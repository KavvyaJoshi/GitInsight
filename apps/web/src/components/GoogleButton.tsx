import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (res: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT_SRC, async: true });
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load Google sign-in')));
    if (!existing) document.head.appendChild(script);
  });
}

/** Renders "Continue with Google" only when the server has a Google client ID configured. */
export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    api<{ googleClientId: string | null }>('/auth/config')
      .then((c) => setClientId(c.googleClientId))
      .catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    loadGoogleScript()
      .then(() => {
        if (!ref.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (res) => callback.current(res.credential) });
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'continue_with', width: 320 });
      })
      .catch(() => undefined);
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> or <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
      <div ref={ref} className="flex justify-center" />
    </div>
  );
}
