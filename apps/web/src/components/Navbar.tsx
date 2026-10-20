import { Link, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { RoleBadge } from './ui';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-slate-200 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`;

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
        <Link to="/" className="mr-auto text-lg font-bold text-indigo-600">
          GitInsight
        </Link>
        <NavLink to="/" end className={linkClass}>
          Home
        </NavLink>
        {user ? (
          <>
            <NavLink to="/account" className={linkClass}>
              My account
            </NavLink>
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
            <RoleBadge role={user.role} />
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Guest</span>
            <NavLink to="/login" className={linkClass}>
              Log in
            </NavLink>
            <NavLink to="/register" className={linkClass}>
              Sign up
            </NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
