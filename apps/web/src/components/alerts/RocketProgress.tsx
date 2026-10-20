import { Flag, Rocket } from 'lucide-react';
import { compactNumber, exactNumber } from '../../lib/format';

/** A rocket climbing towards the star goal: how far the repository is from triggering the alert. */
export function RocketProgress({ current, goal }: { current: number | null; goal: number }) {
  const pct = current === null ? 0 : Math.min(100, (current / goal) * 100);
  const reached = current !== null && current >= goal;
  return (
    <div className="pt-3" aria-label={current === null ? `Goal ${exactNumber(goal)} stars` : `${exactNumber(current)} of ${exactNumber(goal)} stars`}>
      <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-linear-to-r from-amber-300 to-amber-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
        <span className={`absolute -top-3 ${reached ? '' : 'rocket-bob'}`} style={{ left: `${Math.max(4, Math.min(96, pct))}%`, transform: 'translate(-50%, 0) rotate(45deg)' }}>
          <Rocket className="size-5 fill-white text-zinc-700 dark:fill-zinc-900 dark:text-zinc-200" aria-hidden />
        </span>
        <Flag className="absolute -top-3.5 -right-1 size-4 fill-amber-400 text-amber-600" aria-hidden />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500 tabular-nums">
        <span>{current === null ? 'Not checked yet' : `${compactNumber(current)} now`}</span>
        <span>{reached ? 'Goal reached!' : `${compactNumber(goal)} goal`}</span>
      </div>
    </div>
  );
}

/** Next "nice" milestone above the current star count. */
export function nextMilestone(stars: number): number {
  const steps = [1, 2.5, 5];
  for (let magnitude = 10; ; magnitude *= 10) {
    for (const s of steps) {
      const value = s * magnitude;
      if (value > stars) return value;
    }
  }
}
