import { useEffect, useState } from 'react';
import { Alert, Card, RoleBadge } from '../components/ui';
import { api, ApiError, type User } from '../lib/api';

export default function AdminPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: User[] }>('/admin/users')
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load users.'));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin panel</h1>
      {error && <Alert>{error}</Alert>}
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Registered users</h2>
        {!users && !error && <p className="text-slate-500">Loading…</p>}
        {users && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{u.name || '—'}</td>
                    <td className="py-2 pr-4"><RoleBadge role={u.role} /></td>
                    <td className="py-2 pr-4 capitalize">{u.status}</td>
                    <td className="py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
