import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, Minus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Alert, Avatar, Button, RoleBadge } from '../components/ui';

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

export default function AccountPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const denied = (useLocation().state as { denied?: string } | null)?.denied;
  if (!user) return null;

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
