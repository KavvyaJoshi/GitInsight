import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionChange, refreshSession, setAccessToken, type AuthResponse, type Preferences, type User } from '../lib/api';
import { setTheme } from '../lib/theme';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (changes: Partial<Preferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Preferences live on the account, so a signed-in user gets their theme on every device.
  const signedIn = useCallback((next: User | null) => {
    setUser(next);
    if (next) setTheme(next.preferences.theme);
  }, []);

  useEffect(() => {
    onSessionChange(setUser);
    // Restore the session from the refresh cookie after a page reload.
    refreshSession()
      .then((session) => signedIn(session?.user ?? null))
      .finally(() => setLoading(false));
  }, [signedIn]);

  const accept = useCallback(
    (res: AuthResponse) => {
      setAccessToken(res.accessToken);
      signedIn(res.user);
    },
    [signedIn],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => accept(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (email, password, name) =>
        accept(await api<AuthResponse>('/auth/register', { method: 'POST', body: { email, password, name } })),
      loginWithGoogle: async (credential) => accept(await api<AuthResponse>('/auth/google', { method: 'POST', body: { credential } })),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setAccessToken(null);
        setUser(null);
      },
      updatePreferences: async (changes) => {
        if (changes.theme) setTheme(changes.theme);
        const res = await api<{ user: User }>('/preferences', { method: 'PUT', body: changes });
        setUser(res.user);
      },
    }),
    [user, loading, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
