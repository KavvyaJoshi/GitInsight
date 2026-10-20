import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Alert, Card, RoleBadge } from '../components/ui';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

export default function AccountPage() {
  const { user } = useAuth();
  const denied = (useLocation().state as { denied?: string } | null)?.denied;
  if (!user) return null;

  const rows: [string, ReactNode][] = [
    ['Name', user.name || 'Not specified'],
    ['Email', user.email],
    ['Role', <RoleBadge role={user.role} />],
    ['Sign-in methods', user.googleLinked ? 'Email/password or Google' : 'Email/password'],
    ['Member since', formatDate(user.createdAt)],
    ['Last login', formatDate(user.lastLoginAt)],
  ];

  return (
    <div className="space-y-6">
      {denied && (
        <Alert>
          Access denied: <code>{denied}</code> is restricted to Administrators. You have been redirected to your own dashboard.
        </Alert>
      )}
      <h1 className="text-2xl font-bold">My account</h1>
      <Card>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
