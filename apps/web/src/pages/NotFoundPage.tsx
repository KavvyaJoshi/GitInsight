import { Link } from 'react-router';
import { buttonClass } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-mono text-sm text-zinc-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-500">The page you’re looking for doesn’t exist or has moved.</p>
      <Link to="/" className={`${buttonClass('primary')} mt-8`}>
        Back to search
      </Link>
    </div>
  );
}
