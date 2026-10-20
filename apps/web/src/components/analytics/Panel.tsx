import { useState, type ReactNode } from 'react';
import { AlertTriangle, BarChart3, Loader2, RotateCw, Table2 } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import type { AnalyticsState } from '../../lib/useAnalytics';
import { Button } from '../ui';

interface PanelProps<T> {
  title: string;
  description: string;
  state: AnalyticsState<T>;
  onRetry: () => void;
  /** Optional row of headline numbers shown above the chart. */
  summary?: (data: T) => ReactNode;
  chart: (data: T) => ReactNode;
  /** Accessible table alternative to the chart. */
  table?: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'The GitInsight server could not be reached.';
}

/** One analytics view with its own loading, pending, empty, error and retry states (REQ-DASH-002). */
export function AnalyticsPanel<T>({ title, description, state, onRetry, summary, chart, table, isEmpty, emptyMessage }: PanelProps<T>) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const ready = state.status === 'ready' ? state.result : null;
  const empty = ready && isEmpty?.(ready.data);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        </div>
        {table && ready && !empty && (
          <div className="flex rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800" role="group" aria-label="View as">
            {(['chart', 'table'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                  view === v ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {v === 'chart' ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
                {v}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="px-6 py-6">
        {state.status === 'loading' && <div className="h-72 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" aria-label="Loading" />}

        {state.status === 'pending' && (
          <div className="flex h-72 flex-col items-center justify-center text-center" role="status">
            <Loader2 className="size-5 animate-spin text-zinc-400" aria-hidden />
            <p className="mt-3 text-sm font-medium">GitHub is preparing these statistics</p>
            <p className="mt-1 max-w-xs text-sm text-zinc-500">This happens the first time a repository is analysed and usually takes a few seconds.</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex h-72 flex-col items-center justify-center text-center" role="alert">
            <AlertTriangle className="size-5 text-amber-500" aria-hidden />
            <p className="mt-3 text-sm font-medium">Couldn’t load {title.toLowerCase()}</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">{errorMessage(state.error)}</p>
            <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
              <RotateCw className="size-3.5" /> Retry
            </Button>
          </div>
        )}

        {ready &&
          (empty ? (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-500">{emptyMessage ?? 'No data for this repository.'}</div>
          ) : (
            <div className="space-y-6">
              {summary?.(ready.data)}
              {view === 'table' && table ? table(ready.data) : chart(ready.data)}
            </div>
          ))}
      </div>

      {ready && (
        <footer className="border-t border-zinc-100 px-6 py-2.5 text-xs text-zinc-400 dark:border-zinc-800/70">
          {ready.stale ? 'GitHub is unavailable, showing the copy computed ' : 'Computed '}
          {relativeTime(ready.computedAt)}
        </footer>
      )}
    </section>
  );
}

export function SummaryRow({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-10 gap-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-zinc-500">{item.label}</dt>
          <dd className="mt-0.5 font-mono text-xl font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`px-4 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={`px-4 py-2 ${i > 0 ? 'text-right font-mono tabular-nums' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartTooltip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg shadow-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="mt-1 flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          {row.color && <span className="size-2 rounded-full" style={{ backgroundColor: row.color }} />}
          <span>{row.label}</span>
          <span className="ml-auto pl-4 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
