import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Navbar } from './components/Navbar';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import ComparePage from './pages/ComparePage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import RepoPage from './pages/RepoPage';

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/library"
            element={
              <RequireAuth>
                <LibraryPage />
              </RequireAuth>
            }
          />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/:owner/:repo" element={<RepoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
          <span>GitInsight · Read-only analytics for public GitHub repositories</span>
          <span>MIT World Peace University, Pune</span>
        </div>
      </footer>
    </div>
  );
}
