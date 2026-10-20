import type { ReactNode } from 'react';
import { Info, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import type { AiSummary, AiTrend, Health } from '../../lib/api';
import { exactNumber, relativeTime } from '../../lib/format';
import { useAnalytics } from '../../lib/useAnalytics';
import { AnalyticsPanel } from './Panel';

export const healthPath = (repoId: number) => `/repositories/${repoId}/health-score`;

/** Circular 0–100 meter. Single hue; the number and grade carry the meaning, not colour. */
export function ScoreRing({ score, size = 132, stroke = 10 }: { score: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={stroke} />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--chart-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      )}
    </svg>
  );
}

// ---- Health ----

export function HealthView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<Health>(healthPath(repoId));

  return (
    <AnalyticsPanel
      title="Repository health"
      description="One score from four signals: activity, community, maintenance and popularity."
      state={state}
      onRetry={retry}
      chart={(h) => (
        <div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <ScoreRing score={h.score} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {h.score === null ? (
                  <span className="px-6 text-sm font-medium text-zinc-500">Not available</span>
                ) : (
                  <>
                    <span className="font-mono text-4xl font-medium tabular-nums">{h.score}</span>
                    <span className="text-xs text-zinc-500">out of 100</span>
                  </>
                )}
              </div>
            </div>
            {h.grade && <p className="mt-3 font-medium">{h.grade}</p>}
            <p className="mt-1 text-xs text-zinc-500">{h.explanation}</p>
          </div>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {h.components.map((c) => (
              <li key={c.key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <span className="w-28 shrink-0 font-medium">{c.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    {c.score !== null && <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${c.score}%`, backgroundColor: 'var(--chart-accent)' }} />}
                  </div>
                  <span className="w-12 text-right font-mono tabular-nums">{c.score ?? '—'}</span>
                </div>
                <div className="mt-2 text-sm text-zinc-500 sm:pl-32">
                  {c.score === null ? (
                    <p className="flex items-start gap-1.5">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Not available. {c.reason}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {c.basis.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      table={(h) => (
        <p className="text-xs text-zinc-500">
          Each signal is scored 0–100 and the overall score is their equal-weight average over the signals that could be measured (at least two). Formula version{' '}
          {h.formulaVersion}.
        </p>
      )}
      viewLabels={{ chart: 'Breakdown', table: 'Method' }}
    />
  );
}

// ---- AI insights ----

function AiFrame({ model, generatedAt, sources, children }: { model: string; generatedAt: string; sources: string[]; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
        <Sparkles className="size-3.5" aria-hidden /> AI-generated
      </span>
      {children}
      <p className="border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800/70">
        Written by {model} {relativeTime(generatedAt)} using only the repository’s {sources.join(', ')}. AI can make mistakes, so check important details against
        the repository itself.
      </p>
    </div>
  );
}

function AiUnavailableNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <Sparkles className="size-6 text-zinc-300 dark:text-zinc-600" aria-hidden />
      <p className="mt-3 max-w-md text-sm text-zinc-500">{message}</p>
    </div>
  );
}

export function AiSummaryView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<AiSummary>(`/repositories/${repoId}/ai-summary`);
  return (
    <AnalyticsPanel
      title="AI summary"
      description="A short executive summary written from the description, README and topics."
      state={state}
      onRetry={retry}
      chart={(d) =>
        !d.available ? (
          <AiUnavailableNotice message={d.message} />
        ) : (
          <AiFrame model={d.model} generatedAt={d.generatedAt} sources={d.sources}>
            <p className="max-w-3xl text-[17px] leading-relaxed text-pretty">{d.summary}</p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {d.highlights.map((h) => (
                <li key={h} className="rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
                  {h}
                </li>
              ))}
            </ul>
          </AiFrame>
        )
      }
    />
  );
}

export function AiTrendView({ repoId }: { repoId: number }) {
  const { state, retry } = useAnalytics<AiTrend>(`/repositories/${repoId}/ai-trend-insight`);
  return (
    <AnalyticsPanel
      title="AI trend insight"
      description="What the commit and contributor numbers say about where the project is heading."
      state={state}
      onRetry={retry}
      chart={(d) => {
        if (!d.available) return <AiUnavailableNotice message={d.message} />;
        const change = d.facts.changePercent;
        const Arrow = change !== null && change < 0 ? TrendingDown : TrendingUp;
        return (
          <AiFrame model={d.model} generatedAt={d.generatedAt} sources={d.sources}>
            <h3 className="text-xl font-semibold tracking-tight">{d.headline}</h3>
            <p className="max-w-3xl leading-relaxed text-pretty text-zinc-700 dark:text-zinc-300">{d.insight}</p>
            <dl className="flex flex-wrap gap-x-10 gap-y-3 rounded-lg bg-zinc-50 px-5 py-4 dark:bg-zinc-900">
              <div>
                <dt className="text-xs text-zinc-500">Last 3 months</dt>
                <dd className="font-mono text-lg tabular-nums">{exactNumber(d.facts.commitsLast3Months)} commits</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Previous 3 months</dt>
                <dd className="font-mono text-lg tabular-nums">{exactNumber(d.facts.commitsPrevious3Months)} commits</dd>
              </div>
              {change !== null && (
                <div>
                  <dt className="text-xs text-zinc-500">Change</dt>
                  <dd className="flex items-center gap-1.5 font-mono text-lg tabular-nums">
                    <Arrow className="size-4" aria-hidden />
                    {change > 0 ? '+' : ''}
                    {change}%
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-zinc-400">These numbers come straight from GitHub; only the wording above is AI-generated.</p>
          </AiFrame>
        );
      }}
    />
  );
}
