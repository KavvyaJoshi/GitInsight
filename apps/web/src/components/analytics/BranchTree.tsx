import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Branches } from '../../lib/api';

type Branch = Branches['branches'][number];
interface Group {
  key: string;
  label: string;
  color: string;
  branches: Branch[];
}

const W = 800;
const H = 520;
const BASE_X = 400;
const GROUND_Y = 490;
const TRUNK_TOP = 110;
const MAX_LEAVES_PER_LIMB = 12;
const MAX_LIMBS = 8;

// Branch-name prefixes that mean the same family.
const ALIASES: Record<string, string> = { feat: 'feature', features: 'feature', bugfix: 'fix', bug: 'fix', fixes: 'fix', releases: 'release' };
const LABELS: Record<string, string> = {
  feature: 'Features',
  fix: 'Fixes',
  hotfix: 'Hotfixes',
  release: 'Releases',
  dependabot: 'Dependabot updates',
  renovate: 'Renovate updates',
  docs: 'Docs',
  chore: 'Chores',
  versions: 'Version lines',
  other: 'Other branches',
};

function familyOf(name: string): string {
  if (name.includes('/')) {
    const prefix = name.split('/')[0].toLowerCase();
    return ALIASES[prefix] ?? prefix;
  }
  return /^v?\d+([.-][\dx]+)*$/i.test(name) ? 'versions' : 'other';
}

/** Small deterministic hash so the same repository always grows the same tree. */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function groupBranches(branches: Branch[]): Group[] {
  const families = new Map<string, Branch[]>();
  for (const b of branches) {
    if (b.isDefault) continue;
    const key = familyOf(b.name);
    families.set(key, [...(families.get(key) ?? []), b]);
  }
  let sorted = [...families].sort((a, b) => b[1].length - a[1].length);
  // Past eight limbs the smallest families share one "Other" limb, keeping colours distinct.
  if (sorted.length > MAX_LIMBS) {
    const kept = sorted.slice(0, MAX_LIMBS - 1).filter(([k]) => k !== 'other');
    const keptKeys = new Set(kept.map(([k]) => k));
    const rest = sorted.filter(([k]) => !keptKeys.has(k)).flatMap(([, list]) => list);
    sorted = [...kept, ['other', rest]];
  }
  return sorted.map(([key, list], i) => ({
    key,
    label: LABELS[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)} branches`,
    color: key === 'other' ? 'var(--chart-other)' : `var(--chart-${(i % 8) + 1})`,
    branches: list,
  }));
}

type Point = { x: number; y: number };
const bezier = (p0: Point, c: Point, p1: Point, t: number): Point => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p1.y,
});
const tangent = (p0: Point, c: Point, p1: Point, t: number): Point => ({
  x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x),
  y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y),
});
/** Half-width of the tapered trunk at height y. */
const trunkHalfWidth = (y: number) => 6 + ((y - TRUNK_TOP) / (GROUND_Y - TRUNK_TOP)) * 14;

interface Leaf {
  branch: Branch;
  twigFrom: Point;
  at: Point;
  angle: number;
  delay: number;
}
interface Limb {
  group: Group;
  start: Point;
  control: Point;
  end: Point;
  width: number;
  delay: number;
  leaves: Leaf[];
  hidden: number;
}

function layout(groups: Group[]): Limb[] {
  return groups.map((group, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const span = Math.max(groups.length - 1, 1);
    const y0 = GROUND_Y - 120 - (i / span) * (GROUND_Y - 120 - TRUNK_TOP - 50);
    const start = { x: BASE_X + side * trunkHalfWidth(y0) * 0.6, y: y0 };
    // Lower limbs are longer, like a real tree; bigger families reach further.
    const length = Math.min(310, Math.max(110, 150 + 16 * Math.sqrt(group.branches.length) - i * 10));
    const angle = ((26 + (hash(group.key) % 14)) * Math.PI) / 180;
    const end = {
      x: Math.min(W - 40, Math.max(40, start.x + side * length * Math.cos(angle))),
      y: Math.max(50, y0 - length * Math.sin(angle)),
    };
    const control = { x: start.x + side * length * 0.55 * Math.cos(angle), y: y0 - length * 0.12 };
    const delay = 0.6 + i * 0.18;

    const shown = group.branches.slice(0, MAX_LEAVES_PER_LIMB);
    const leaves = shown.map((branch, j) => {
      const t = shown.length === 1 ? 0.9 : 0.3 + 0.68 * (j / (shown.length - 1));
      const at = bezier(start, control, end, t);
      const tan = tangent(start, control, end, t);
      const base = Math.atan2(tan.y, tan.x);
      const dir = base + (j % 2 === 0 ? -1 : 1) * 0.85;
      const len = 20 + (hash(branch.name) % 12);
      let tip = { x: at.x + len * Math.cos(dir), y: at.y + len * Math.sin(dir) };
      if (tip.y > GROUND_Y - 24) tip = { x: at.x + len * Math.cos(-Math.abs(dir)), y: at.y - len * Math.abs(Math.sin(dir)) };
      return { branch, twigFrom: at, at: tip, angle: (Math.atan2(tip.y - at.y, tip.x - at.x) * 180) / Math.PI, delay: delay + 0.6 + j * 0.05 };
    });

    return { group, start, control, end, width: Math.min(12, 3.5 + Math.sqrt(group.branches.length) * 1.4), delay, leaves, hidden: group.branches.length - shown.length };
  });
}

const LEAF_PATH = 'M0,0 C5,-7 15,-8 22,0 C15,8 5,7 0,0 Z';

/** A real-looking tree: the trunk is the default branch, limbs are branch families, leaves are branches. */
export function BranchTree({ branches, defaultBranch, repoUrl, morePages }: { branches: Branch[]; defaultBranch: string; repoUrl: string; morePages: boolean }) {
  const [generation, setGeneration] = useState(0);
  const [hover, setHover] = useState<{ at: Point; title: string; detail: string } | null>(null);
  const groups = useMemo(() => groupBranches(branches), [branches]);
  const limbs = useMemo(() => layout(groups), [groups]);
  const branchUrl = (name: string) => `${repoUrl}/tree/${name.split('/').map(encodeURIComponent).join('/')}`;

  const trunk = `M${BASE_X - 20},${GROUND_Y} C${BASE_X - 14},${GROUND_Y - 140} ${BASE_X - 10},${TRUNK_TOP + 140} ${BASE_X - 6},${TRUNK_TOP}
    L${BASE_X + 6},${TRUNK_TOP} C${BASE_X + 10},${TRUNK_TOP + 140} ${BASE_X + 14},${GROUND_Y - 140} ${BASE_X + 20},${GROUND_Y} Z`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_17rem]">
      <div className="relative overflow-hidden rounded-xl bg-linear-to-b from-sky-50 to-white dark:from-sky-950/30 dark:to-zinc-950">
        <svg key={generation} viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Branch tree: ${defaultBranch} trunk with ${branches.length - 1} other branches`}>
          <ellipse cx={BASE_X} cy={GROUND_Y + 6} rx={330} ry={22} fill="var(--tree-grass)" />
          {/* Roots */}
          {[-1, 1].map((s) => (
            <path key={s} d={`M${BASE_X + s * 12},${GROUND_Y - 4} q${s * 26},6 ${s * 46},16`} stroke="var(--tree-bark-dark)" strokeWidth={5} strokeLinecap="round" fill="none" />
          ))}

          <g className="tree-sway">
            <path d={trunk} fill="var(--tree-bark)" className="tree-grow" style={{ animationDelay: '0.1s' }} />
            <path
              d={`M${BASE_X - 3},${GROUND_Y - 30} C${BASE_X - 2},${GROUND_Y - 160} ${BASE_X},${TRUNK_TOP + 160} ${BASE_X},${TRUNK_TOP + 20}`}
              stroke="var(--tree-bark-dark)"
              strokeWidth={2}
              fill="none"
              opacity={0.5}
              className="tree-grow"
              style={{ animationDelay: '0.1s' }}
            />

            {limbs.map((limb) => (
              <g key={limb.group.key}>
                <path
                  d={`M${limb.start.x},${limb.start.y} Q${limb.control.x},${limb.control.y} ${limb.end.x},${limb.end.y}`}
                  pathLength={1}
                  stroke="var(--tree-bark)"
                  strokeWidth={limb.width}
                  strokeLinecap="round"
                  fill="none"
                  className="tree-draw"
                  style={{ animationDelay: `${limb.delay}s` }}
                />
                {limb.leaves.map((leaf) => (
                  <a
                    key={leaf.branch.name}
                    href={branchUrl(leaf.branch.name)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Branch ${leaf.branch.name}${leaf.branch.protected ? ' (protected)' : ''}`}
                    onMouseEnter={() =>
                      setHover({
                        at: leaf.at,
                        title: leaf.branch.name,
                        detail: `${limb.group.label}${leaf.branch.protected ? ' · protected 🍎' : ''} · click to open`,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer outline-none"
                  >
                    <line
                      x1={leaf.twigFrom.x}
                      y1={leaf.twigFrom.y}
                      x2={leaf.at.x}
                      y2={leaf.at.y}
                      pathLength={1}
                      stroke="var(--tree-bark)"
                      strokeWidth={2}
                      strokeLinecap="round"
                      className="tree-draw"
                      style={{ animationDelay: `${leaf.delay - 0.3}s`, animationDuration: '0.4s' }}
                    />
                    <g transform={`translate(${leaf.at.x},${leaf.at.y})`}>
                      <g className="tree-pop" style={{ animationDelay: `${leaf.delay}s` }}>
                        {/* Generous invisible hit area so small leaves are easy to hover and tap. */}
                        <circle r={13} fill="transparent" />
                        {leaf.branch.protected ? (
                          <>
                            <path d="M0,-6 q2,-5 5,-6" stroke="var(--tree-bark-dark)" strokeWidth={1.5} fill="none" />
                            <circle r={7} fill="var(--tree-apple)" stroke="var(--chart-surface)" strokeWidth={1.5} />
                            <circle cx={-2.5} cy={-2.5} r={1.8} fill="white" opacity={0.6} />
                          </>
                        ) : (
                          <path
                            d={LEAF_PATH}
                            transform={`rotate(${leaf.angle})`}
                            fill={limb.group.color}
                            stroke="var(--chart-surface)"
                            strokeWidth={1.5}
                            className="transition-[filter] hover:brightness-125"
                          />
                        )}
                      </g>
                    </g>
                  </a>
                ))}
                {limb.hidden > 0 && (
                  <g transform={`translate(${limb.end.x},${limb.end.y})`}>
                    <g className="tree-pop" style={{ animationDelay: `${limb.delay + 1.2}s` }}>
                      <circle r={15} fill={limb.group.color} stroke="var(--chart-surface)" strokeWidth={2} />
                      <text textAnchor="middle" dy={4} fontSize={11} fontWeight={600} fill="white">
                        +{limb.hidden}
                      </text>
                    </g>
                  </g>
                )}
              </g>
            ))}

            {/* The top of the trunk: the latest work on the default branch. */}
            <g transform={`translate(${BASE_X},${TRUNK_TOP - 6})`}>
              <g className="tree-pop" style={{ animationDelay: '0.7s' }}>
                <path d={LEAF_PATH} transform="rotate(-120) scale(1.3)" fill="var(--chart-accent)" />
                <path d={LEAF_PATH} transform="rotate(-60) scale(1.3)" fill="var(--chart-accent)" />
                <path d={LEAF_PATH} transform="rotate(-90) scale(1.5)" fill="var(--chart-accent)" />
              </g>
            </g>
          </g>

          {/* Wooden sign naming the trunk. */}
          <g transform={`translate(${BASE_X + 60},${GROUND_Y - 44})`}>
            <rect x={14} y={20} width={5} height={30} fill="var(--tree-bark-dark)" />
            <rect x={-30} y={0} width={94} height={28} rx={5} fill="var(--tree-bark)" stroke="var(--tree-bark-dark)" strokeWidth={2} />
            <text x={17} y={18} textAnchor="middle" fontSize={13} fontFamily="var(--font-mono)" fontWeight={600} fill="white">
              {defaultBranch.length > 11 ? `${defaultBranch.slice(0, 10)}…` : defaultBranch}
            </text>
          </g>
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            style={{ left: `${(hover.at.x / W) * 100}%`, top: `calc(${(hover.at.y / H) * 100}% - 12px)` }}
          >
            <p className="font-mono font-medium">{hover.title}</p>
            <p className="mt-0.5 text-zinc-500">{hover.detail}</p>
          </div>
        )}

        <button
          onClick={() => setGeneration((g) => g + 1)}
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white/80 px-2.5 py-1 text-xs text-zinc-600 backdrop-blur hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300"
        >
          <RotateCcw className="size-3" /> Grow again
        </button>
      </div>

      <aside className="space-y-6 text-sm">
        <div>
          <h3 className="font-medium">How to read this tree</h3>
          <ul className="mt-3 space-y-3 text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-3">
              <span className="mt-1 h-4 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: 'var(--tree-bark)' }} />
              <span>
                <b className="text-zinc-900 dark:text-zinc-100">The trunk</b> is <span className="font-mono">{defaultBranch}</span>, the main version everyone shares.
              </span>
            </li>
            <li className="flex gap-3">
              <svg viewBox="-2 -9 26 18" className="mt-0.5 h-4 w-5 shrink-0">
                <path d={LEAF_PATH} fill="var(--chart-1)" />
              </svg>
              <span>
                <b className="text-zinc-900 dark:text-zinc-100">Each leaf</b> is a branch: a safe copy where someone tries an idea without touching the trunk.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 size-3.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--tree-apple)' }} />
              <span>
                <b className="text-zinc-900 dark:text-zinc-100">Apples</b> are protected branches. Nobody can change them without permission.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-1 w-5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--tree-bark)' }} />
              <span>
                <b className="text-zinc-900 dark:text-zinc-100">Limbs</b> group branches from the same family, like every <span className="font-mono">fix/…</span> branch.
              </span>
            </li>
          </ul>
        </div>

        {groups.length > 0 && (
          <div>
            <h3 className="font-medium">Families</h3>
            <ul className="mt-3 space-y-2">
              {groups.map((g) => (
                <li key={g.key} className="flex items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="flex-1 truncate">{g.label}</span>
                  <span className="font-mono text-zinc-500 tabular-nums">{g.branches.length}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {groups.length === 0 && <p className="text-zinc-500">Only the trunk so far: this repository has no other branches.</p>}
        {morePages && <p className="text-xs text-zinc-500">This tree shows the branches on the current page. Use Next to see the rest of the forest.</p>}
      </aside>
    </div>
  );
}
