import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui';

const FEATURES: { name: string; guest: boolean; user: boolean; admin: boolean }[] = [
  { name: 'Search public repositories & view analytics', guest: true, user: true, admin: true },
  { name: 'AI summary and trend insight', guest: true, user: true, admin: true },
  { name: 'Bookmarks, history and comparison', guest: false, user: true, admin: true },
  { name: 'Alerts and report export', guest: false, user: true, admin: true },
  { name: 'Admin panel (usage, user accounts)', guest: false, user: false, admin: true },
];

const Mark = ({ ok }: { ok: boolean }) => <span className={ok ? 'text-emerald-600' : 'text-slate-400'}>{ok ? '✓' : '—'}</span>;

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">Interactive GitHub repository analytics</h1>
        <p className="text-slate-600 dark:text-slate-400">
          {user
            ? `Welcome back, ${user.name || user.email}.`
            : 'You are browsing as a guest. Search and analytics stay open to everyone; sign up to save and track repositories.'}
        </p>
        {!user && (
          <div className="flex gap-3 pt-2">
            <Link to="/register" className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500">
              Create account
            </Link>
            <Link to="/login" className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900">
              Log in
            </Link>
          </div>
        )}
      </section>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">What each user class can do</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="px-3 py-2 text-center font-medium">Guest</th>
                <th className="px-3 py-2 text-center font-medium">Registered</th>
                <th className="px-3 py-2 text-center font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-4">{f.name}</td>
                  <td className="px-3 py-2 text-center"><Mark ok={f.guest} /></td>
                  <td className="px-3 py-2 text-center"><Mark ok={f.user} /></td>
                  <td className="px-3 py-2 text-center"><Mark ok={f.admin} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
