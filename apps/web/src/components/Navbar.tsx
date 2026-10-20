import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Layers, Library, LogOut, Moon, Shield, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { THEME_EVENT, isDark, setTheme } from '../lib/theme';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { RepoSearch } from './RepoSearch';
import { useToast } from './Toast';
import { Avatar, RoleBadge, buttonClass } from './ui';

const AUTH_PAGES = ['/login', '/register'];

function ThemeToggle() {
  const { user, updatePreferences } = useAuth();
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const sync = () => setDark(isDark());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  return (
    <button
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        // Signed-in users keep the choice on their account; guests keep it on this device.
        if (user) updatePreferences({ theme: next }).catch(() => undefined);
        else setTheme(next);
      }}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`${buttonClass('ghost', 'sm')} w-8 px-0`}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const item =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800';
  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        <Avatar user={user} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-2 px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name || 'Unnamed user'}</p>
              <p className="truncate text-xs text-zinc-500">{user.email}</p>
            </div>
            <RoleBadge role={user.role} />
          </div>
          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          <Link to="/library" role="menuitem" className={item} onClick={close}>
            <Library className="size-4 text-zinc-400" /> Library
          </Link>
          <Link to="/compare" role="menuitem" className={item} onClick={close}>
            <Layers className="size-4 text-zinc-400" /> Compare
          </Link>
          <Link to="/account" role="menuitem" className={item} onClick={close}>
            <UserRound className="size-4 text-zinc-400" /> Account & preferences
          </Link>
          {user.role === 'admin' && (
            <Link to="/admin" role="menuitem" className={item} onClick={close}>
              <Shield className="size-4 text-zinc-400" /> Admin console
            </Link>
          )}
          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          <button
            role="menuitem"
            className={item}
            onClick={async () => {
              close();
              await logout();
              toast('Signed out');
              navigate('/');
            }}
          >
            <LogOut className="size-4 text-zinc-400" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const showSearch = pathname !== '/' && !AUTH_PAGES.includes(pathname);
  const from = AUTH_PAGES.includes(pathname) ? undefined : pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        {user && (
          <nav className="hidden items-center gap-1 sm:flex">
            {[
              { to: '/library', label: 'Library' },
              { to: '/compare', label: 'Compare' },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  pathname.startsWith(link.to)
                    ? 'font-medium text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        {showSearch && (
          <div className="hidden max-w-sm flex-1 md:block">
            <RepoSearch size="sm" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {loading ? (
            <div className="size-8 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          ) : user ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Link to="/login" state={{ from }} className={buttonClass('ghost', 'sm')}>
                Sign in
              </Link>
              <Link to="/register" state={{ from }} className={buttonClass('primary', 'sm')}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
