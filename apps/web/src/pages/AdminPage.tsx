import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Alert, Avatar, RoleBadge, Spinner } from '../components/ui';
import { api, ApiError, type User } from '../lib/api';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-5 py-4 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api<{ users: User[] }>('/admin/users')
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load users.'));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.email.includes(q) || u.name.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs tracking-wide text-zinc-500 uppercase">Admin console</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Users</h1>

      {error && (
        <div className="mt-6">
          <Alert>{error}</Alert>
        </div>
      )}
      {!users && !error && <Spinner label="Loading users" />}

      {users && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
            <Stat label="Total accounts" value={users.length} />
            <Stat label="Administrators" value={users.filter((u) => u.role === 'admin').length} />
            <Stat label="Active" value={users.filter((u) => u.status === 'active').length} />
            <Stat label="Deactivated" value={users.filter((u) => u.status === 'deactivated').length} />
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <Search className="size-4 text-zinc-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or email"
                aria-label="Filter users"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
              <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                {filtered.length} of {users.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Joined</th>
                    <th className="px-4 py-2.5 font-medium">Last sign-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.name || 'Unnamed user'}</p>
                            <p className="truncate text-xs text-zinc-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          <span className={`size-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(u.lastLoginAt)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                        No users match “{query}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
