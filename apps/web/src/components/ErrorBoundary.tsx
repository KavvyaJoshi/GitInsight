import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** "panel" keeps a crash inside one dashboard view; "page" is the last line of defence for the whole app. */
  variant?: 'panel' | 'page';
}

/** Catches render errors so one broken view shows a message instead of blanking the whole app. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const page = this.props.variant === 'page';
    return (
      <div className={`flex flex-col items-center justify-center text-center ${page ? 'min-h-[60vh] px-4' : 'rounded-xl border border-zinc-200 px-6 py-16 dark:border-zinc-800'}`} role="alert">
        <AlertTriangle className="size-6 text-amber-500" aria-hidden />
        <p className="mt-3 font-medium">{page ? 'Something went wrong' : 'This view couldn’t be displayed'}</p>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          {page ? 'An unexpected error stopped the page from loading.' : 'The rest of the dashboard still works. Try again, or pick another tab.'}
        </p>
        <button
          onClick={() => (page ? window.location.reload() : this.setState({ error: null }))}
          className="mt-5 inline-flex h-8 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          <RotateCw className="size-3.5" /> {page ? 'Reload the page' : 'Try again'}
        </button>
      </div>
    );
  }
}
