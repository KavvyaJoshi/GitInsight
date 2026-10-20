import { useCallback, useRef, useState } from 'react';
import { Braces, Download, FileText, Loader2, Sheet } from 'lucide-react';
import { ApiError, downloadFile } from '../lib/api';
import { useDismiss } from '../lib/useDismiss';
import { useToast } from './Toast';
import { buttonClass } from './ui';

const FORMATS = [
  { id: 'pdf', label: 'PDF report', hint: 'Designed, printable summary', icon: FileText },
  { id: 'csv', label: 'CSV', hint: 'For spreadsheets', icon: Sheet },
  { id: 'json', label: 'JSON', hint: 'Every number, machine-readable', icon: Braces },
] as const;

/** Download the current analytics as PDF, CSV or JSON (REQ-PERS-003). */
export function ExportMenu({ repoId }: { repoId: number }) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  async function run(format: (typeof FORMATS)[number]['id']) {
    setBusy(format);
    try {
      await downloadFile(`/repositories/${repoId}/export`, { format });
      setOpen(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'The export failed. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={buttonClass('secondary', 'sm')}>
        <Download className="size-3.5" /> Export
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              disabled={busy !== null}
              onClick={() => run(f.id)}
              className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800"
            >
              {busy === f.id ? <Loader2 className="size-4 animate-spin text-zinc-400" /> : <f.icon className="size-4 text-zinc-400" />}
              <span>
                <span className="block text-sm">{f.label}</span>
                <span className="block text-xs text-zinc-500">{f.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
