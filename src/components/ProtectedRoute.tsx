import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Avoid flashing protected content while Supabase restores a saved session.
  if (loading) return <RouteLoading />;

  if (!user) {
    // Remember the requested URL so the login page can return the user to it.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <RouteLoading />;
  if (!user) return <Navigate to="/login" replace />;

  // This protects the interface. Row Level Security protects the actual data.
  if (profile?.role !== 'admin') return <Navigate to="/account" replace />;

  return children;
}

function RouteLoading() {
  return (
    <main className="centered-page" aria-live="polite">
      <div>
        <div className="loading-mark">✓</div>
        <p>Checking your DeviDex session…</p>
      </div>
    </main>
  );
}
