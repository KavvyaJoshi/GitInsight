import { useMemo, useRef, useState } from 'react';
import { formatDate } from '../../lib/format';

type Day = { date: string; count: number };

const CELL = 11;
const GAP = 3;
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/** Count thresholds splitting non-zero days into four quartile levels. */
function levelThresholds(days: Day[]): number[] {
  const values = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  if (!values.length) return [1, 1, 1];
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
  return [q(0.25), q(0.5), q(0.75)];
}

function level(count: number, [t1, t2, t3]: number[]): number {
  if (count === 0) return 0;
  if (count <= t1) return 1;
  if (count <= t2) return 2;
  if (count <= t3) return 3;
  return 4;
}

/** Calendar heatmap of daily commits: one column per Monday-first week, colour intensity per activity level. */
export function CommitHeatmap({ days }: { days: Day[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ day: Day; x: number; y: number } | null>(null);

  const { weeks, months, thresholds } = useMemo(() => {
    const lead = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const cells: (Day | null)[] = [...Array<null>(lead).fill(null), ...days];
    const weeks: (Day | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // Label a column with its month when that week contains the 1st (or opens the grid).
    const months: { col: number; label: string }[] = [];
    weeks.forEach((week, col) => {
      const first = week.find((d) => d && (d.date.endsWith('-01') || col === 0));
      if (!first) return;
      const label = new Date(`${first.date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' });
      const prev = months.at(-1);
      if (!prev || col - prev.col >= 3) months.push({ col, label });
    });
    return { weeks, months, thresholds: levelThresholds(days) };
  }, [days]);

  const width = weeks.length * (CELL + GAP);

  return (
    <div ref={containerRef} className="relative">
      <div className="overflow-x-auto pb-2">
        <div className="inline-flex gap-2">
          <div className="grid shrink-0 pt-5 text-[10px] text-zinc-400" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}>
            {ROW_LABELS.map((label, i) => (
              <span key={i} className="leading-[11px]">
                {label}
              </span>
            ))}
          </div>
          <div>
            <div className="relative h-5 text-[10px] text-zinc-400" style={{ width }}>
              {months.map((m) => (
                <span key={m.col} className="absolute top-0" style={{ left: m.col * (CELL + GAP) }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div
              className="grid"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoFlow: 'column', gridAutoColumns: `${CELL}px`, gap: GAP }}
              onMouseLeave={() => setHover(null)}
            >
              {weeks.flat().map((day, i) =>
                day ? (
                  <div
                    key={day.date}
                    className="rounded-[3px] ring-zinc-900/10 hover:ring-2 dark:ring-white/30"
                    style={{ backgroundColor: `var(--heat-${level(day.count, thresholds)})` }}
                    onMouseEnter={(e) => {
                      const box = containerRef.current!.getBoundingClientRect();
                      const cell = e.currentTarget.getBoundingClientRect();
                      setHover({ day, x: cell.left - box.left + CELL / 2, y: cell.top - box.top });
                    }}
                  />
                ) : (
                  <div key={`pad-${i}`} />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <span className="font-mono font-medium tabular-nums">{hover.day.count}</span> commit{hover.day.count === 1 ? '' : 's'} on{' '}
          {formatDate(hover.day.date)}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-zinc-500">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="rounded-[3px]" style={{ width: CELL, height: CELL, backgroundColor: `var(--heat-${l})` }} />
        ))}
        More
      </div>
    </div>
  );
}

export function longestStreak(days: Day[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
