import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { useToast } from '../components/Toast';
import { Alert, Button, Field, PasswordField } from '../components/ui';
import { ApiError } from '../lib/api';

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
];

export default function RegisterPage() {
  const { user, register, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={from} replace />;

  const passwordOk = RULES.every((r) => r.test(form.password));

  async function run(action: () => Promise<void>, message: string) {
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await action();
      toast(message);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // Field-level problems are shown under the field; only general errors use the banner.
        if (Object.keys(err.fields).length) setFieldErrors(err.fields);
        else if (err.code === 'EMAIL_TAKEN') setFieldErrors({ email: err.message });
        else setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => register(form.email, form.password, form.name), 'Account created. Welcome to GitInsight!');
  }

  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    setFieldErrors(({ [key]: _, ...rest }) => rest);
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free. Adds bookmarks, history, comparison and alerts to everything guests get."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={{ from }} className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Name" autoComplete="name" autoFocus placeholder="Optional" value={form.name} onChange={update('name')} error={fieldErrors.name} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} error={fieldErrors.email} />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
          hint={
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {RULES.map((rule) => {
                const met = rule.test(form.password);
                return (
                  <li key={rule.label} className={`flex items-center gap-1 transition-colors ${met ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    <Check className={`size-3.5 ${met ? 'opacity-100' : 'opacity-30'}`} aria-hidden />
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          }
        />
        <Button type="submit" size="lg" loading={busy} disabled={!form.email || !passwordOk} className="w-full">
          Create account
        </Button>
      </form>
      <div className="mt-5">
        <GoogleButton onCredential={(credential) => run(() => loginWithGoogle(credential), 'Signed in with Google')} />
      </div>
    </AuthLayout>
  );
}
