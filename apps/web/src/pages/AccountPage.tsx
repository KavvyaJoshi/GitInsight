import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, Minus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Alert, Avatar, Button, RoleBadge } from '../components/ui';
import type { Preferences } from '../lib/api';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-zinc-200 py-8 md:grid-cols-[16rem_1fr] md:gap-10 dark:border-zinc-800">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function Method({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm ${enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
        {enabled ? <Check className="size-4" /> : <Minus className="size-4" />}
        {enabled ? 'Connected' : 'Not connected'}
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 max-w-xs text-xs text-zinc-500">{hint}</p>}
      </div>
      <div className="inline-flex shrink-0 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => value !== o.value && onChange(o.value)}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              value === o.value ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { user, logout, updatePreferences } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const denied = (useLocation().state as { denied?: string } | null)?.denied;
  if (!user) return null;

  const save = (changes: Partial<Preferences>) =>
    updatePreferences(changes)
      .then(() => toast('Preferences saved'))
      .catch(() => toast('Could not save your preferences.', 'error'));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {denied && (
        <div className="mb-8">
          <Alert title="Access denied">
            <span className="font-mono">{denied}</span> is restricted to administrators, so you have been brought back to your account.
          </Alert>
        </div>
      )}

      <div className="flex items-center gap-4 pb-8">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{user.name || 'Unnamed user'}</h1>
            <RoleBadge role={user.role} />
          </div>
          <p className="truncate text-sm text-zinc-500">{user.email}</p>
        </div>
      </div>

      <Section title="Profile" description="Basic details about your GitInsight account.">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          <Row label="Name">{user.name || <span className="text-zinc-400">Not specified</span>}</Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Role">{user.role === 'admin' ? 'Administrator' : 'Registered user'}</Row>
          <Row label="Member since">{formatDate(user.createdAt)}</Row>
          <Row label="Last sign-in">{formatDate(user.lastLoginAt)}</Row>
        </dl>
      </Section>

      <Section title="Sign-in methods" description="Ways you can sign in to this account.">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          <Method label="Email and password" enabled={user.passwordSet} />
          <Method label="Google" enabled={user.googleLinked} />
        </div>
      </Section>

      <Section title="Preferences" description="Saved to your account, so they follow you to every device.">
        <div className="space-y-5">
          <Segmented
            label="Theme"
            value={user.preferences.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => save({ theme })}
          />
          <Segmented
            label="Analytics open as"
            value={user.preferences.defaultView}
            options={[
              { value: 'chart', label: 'Charts' },
              { value: 'table', label: 'Tables' },
            ]}
            onChange={(defaultView) => save({ defaultView })}
          />
          <Segmented
            label="Email digest"
            hint="Your choice is saved now; digests are sent once email delivery is switched on for this deployment."
            value={user.preferences.digest}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
            ]}
            onChange={(digest) => save({ digest })}
          />
        </div>
      </Section>

      <Section title="Session" description="Signing out ends this session and revokes its refresh token.">
        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            toast('Signed out');
            navigate('/');
          }}
        >
          Sign out
        </Button>
      </Section>
    </div>
  );
}
