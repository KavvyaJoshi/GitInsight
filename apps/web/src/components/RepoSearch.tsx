import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Search } from 'lucide-react';
import { parseRepoRef } from '../lib/repoRef';
import { Kbd } from './ui';

const EXAMPLES = ['facebook/react', 'vercel/next.js', 'microsoft/vscode', 'torvalds/linux'];

/** Owner/repository search. "lg" is the home console; "sm" sits in the header on other pages. */
export function RepoSearch({ size = 'lg', autoFocus = false }: { size?: 'sm' | 'lg'; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // "/" focuses the search from anywhere, like most developer tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== '/' || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(input: string) {
    const result = parseRepoRef(input);
    if (!result.ok) {
      setError(result.error);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setValue('');
    inputRef.current?.blur();
    navigate(`/${result.value.owner}/${result.value.repo}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(value);
  }

  const errorId = `repo-search-error-${size}`;

  if (size === 'sm') {
    return (
      <form onSubmit={onSubmit} role="search" className="relative w-full">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Search owner/repository"
          aria-label="Search a GitHub repository"
          aria-invalid={Boolean(error)}
          title={error ?? undefined}
          spellCheck={false}
          autoCapitalize="off"
          className={`h-9 w-full rounded-md border bg-zinc-50 pr-9 pl-8 font-mono text-[13px] outline-none transition placeholder:font-sans placeholder:text-zinc-400 focus:bg-white focus:ring-4 dark:bg-zinc-900 dark:focus:bg-zinc-900 ${
            error
              ? 'border-red-400 focus:ring-red-500/15'
              : 'border-zinc-200 focus:border-zinc-400 focus:ring-zinc-900/5 dark:border-zinc-800 dark:focus:border-zinc-600 dark:focus:ring-white/5'
          }`}
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
          <Kbd>/</Kbd>
        </span>
      </form>
    );
  }

  return (
    <div className="w-full">
      <form
        onSubmit={onSubmit}
        role="search"
        className={`flex items-center gap-2 rounded-xl border bg-white p-1.5 pl-4 shadow-sm shadow-zinc-900/5 transition focus-within:ring-4 dark:bg-zinc-900 ${
          error
            ? 'border-red-400 focus-within:ring-red-500/15'
            : 'border-zinc-300 focus-within:border-zinc-900 focus-within:ring-zinc-900/5 dark:border-zinc-700 dark:focus-within:border-zinc-400 dark:focus-within:ring-white/5'
        }`}
      >
        <Search className="size-5 shrink-0 text-zinc-400" aria-hidden />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="owner/repository or paste a GitHub URL"
          aria-label="GitHub repository"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-[15px] outline-none placeholder:font-sans placeholder:text-zinc-400"
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <span className="hidden sm:inline">Analyze</span>
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </form>
      <div className="mt-3 min-h-6 text-sm">
        {error ? (
          <p id={errorId} className="text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-zinc-500">
            <span className="mr-1">Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => go(example)}
                className="rounded-md border border-zinc-200 px-2 py-0.5 font-mono text-[12.5px] text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-white"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
