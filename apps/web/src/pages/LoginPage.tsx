import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, PasswordField } from '../components/ui';
import { ApiError } from '../lib/api';

const DEMO_ACCOUNTS = [
  { label: 'Member', email: 'user@gitinsight.dev', password: 'User@1234' },
  { label: 'Admin', email: 'admin@gitinsight.dev', password: 'Admin@1234' },
];

function useCountdown(target: number | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? Math.max(0, target - now) : 0;
}

const formatRemaining = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export default function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const remaining = useCountdown(lockedUntil);
  const locked = lockedUntil !== null && remaining > 0;

  if (user && !busy) return <Navigate to={from} replace />;

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      toast('Signed in');
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_LOCKED' && typeof err.details.lockedUntil === 'string') {
        setLockedUntil(Date.parse(err.details.lockedUntil));
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => login(email, password));
  }

  return (
    <AuthLayout
      title="Sign in to GitInsight"
      subtitle="Pick up where you left off with your saved repositories."
      footer={
        <>
          New here?{' '}
          <Link to="/register" state={{ from }} className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
            Create an account
          </Link>{' '}
          or{' '}
          <Link to="/" className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
            keep browsing as a guest
          </Link>
          .
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {locked && (
          <Alert title="Account temporarily locked">
            Too many failed attempts. Try again in <span className="font-mono tabular-nums">{formatRemaining(remaining)}</span>.
          </Alert>
        )}
        {error && !locked && <Alert>{error}</Alert>}
        <Field label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" size="lg" loading={busy} disabled={!email || !password} className="w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-5">
        <GoogleButton onCredential={(credential) => run(() => loginWithGoogle(credential))} />
      </div>

      {import.meta.env.DEV && (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-xs font-medium text-zinc-500">Demo accounts (development only)</p>
          <div className="mt-2 flex gap-2">
            {DEMO_ACCOUNTS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => {
                  setEmail(demo.email);
                  setPassword(demo.password);
                }}
                className="flex-1 rounded-md bg-zinc-100 px-2 py-1.5 text-left text-xs hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <span className="block font-medium">{demo.label}</span>
                <span className="block truncate font-mono text-zinc-500">{demo.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
