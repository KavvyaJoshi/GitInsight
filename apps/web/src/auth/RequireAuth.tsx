import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '../lib/api';
import { useAuth } from './AuthContext';

export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-8 text-center text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Signed-in users without the required role are sent to their own dashboard with an access-denied notice.
  if (role && user.role !== role) return <Navigate to="/account" replace state={{ denied: location.pathname }} />;
  return children;
}
