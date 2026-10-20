import { Link } from 'react-router';

export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" className="fill-zinc-900 dark:fill-zinc-100" />
      <rect x="6" y="12" width="3" height="6" rx="1" className="fill-emerald-400 dark:fill-emerald-500" />
      <rect x="10.5" y="9" width="3" height="9" rx="1" className="fill-white dark:fill-zinc-900" />
      <rect x="15" y="6" width="3" height="12" rx="1" className="fill-white dark:fill-zinc-900" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-emerald-500">
      <LogoMark />
      <span>GitInsight</span>
    </Link>
  );
}
