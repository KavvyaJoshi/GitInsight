import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { GoogleButton } from '../components/GoogleButton';
import { Alert, Button, Card, Field } from '../components/ui';
import { ApiError } from '../lib/api';

export default function RegisterPage() {
  const { user, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/account" replace />;

  async function run(action: () => Promise<void>) {
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await action();
      navigate('/account', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setError('Could not reach the server. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => register(form.email, form.password, form.name));
  }

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Name" autoComplete="name" value={form.name} onChange={update('name')} error={fieldErrors.name} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} error={fieldErrors.email} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
        />
        <p className="text-xs text-slate-500">At least 8 characters, including a letter and a number.</p>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>
      <div className="mt-4">
        <GoogleButton onCredential={(credential) => run(() => loginWithGoogle(credential))} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-indigo-600 hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
