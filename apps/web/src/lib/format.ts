const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const compactNumber = (n: number) => compactFormatter.format(n);
export const exactNumber = (n: number) => n.toLocaleString('en');

export function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en', { dateStyle: 'medium' });
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];
const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(iso: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

// GitHub linguist colours for common languages; anything else falls back to grey.
const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#663399',
  Shell: '#89e051',
  Vue: '#41b883',
  Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B',
};

export const languageColor = (language: string) => LANGUAGE_COLORS[language] ?? '#a1a1aa';
