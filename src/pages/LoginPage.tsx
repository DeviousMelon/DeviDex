import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, configured, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ProtectedRoute stores the page the user originally wanted here.
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={returnTo} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);

    const result = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password, username);

    setSubmitting(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    if (mode === 'signup') {
      // Many Supabase projects require email confirmation. If yours does not,
      // the auth listener will establish the session immediately instead.
      setMessage('Account created. Check your email if Supabase asks you to confirm it.');
      return;
    }

    navigate(returnTo, { replace: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <img src="/assets/logos/devidex-symbol.svg" alt="" />
          <div>
            <p className="eyebrow">DEVIDEX ACCOUNT</p>
            <h1>{mode === 'signin' ? 'Welcome back.' : 'Start your collection.'}</h1>
          </div>
        </div>

        {!configured && (
          <div className="setup-notice">
            <strong>Supabase is not connected yet.</strong>
            <p>
              The UI is ready, but login stays disabled until you copy <code>.env.example</code>
              to <code>.env.local</code> and add your Supabase project URL and publishable key.
            </p>
          </div>
        )}

        <div className="auth-tabs" role="tablist" aria-label="Account action">
          <button className={mode === 'signin' ? 'is-active' : ''} type="button" onClick={() => setMode('signin')}>Sign in</button>
          <button className={mode === 'signup' ? 'is-active' : ''} type="button" onClick={() => setMode('signup')}>Create account</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Devi" maxLength={32} />
            </label>
          )}

          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} placeholder="At least 8 characters" />
          </label>

          {message && <p className="form-message" role="status">{message}</p>}

          <button className="button button--primary auth-submit" disabled={!configured || submitting}>
            {submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </section>

      <aside className="auth-sidecopy">
        <p className="eyebrow">WHY AN ACCOUNT?</p>
        <h2>Your collection should survive changing browsers.</h2>
        <p>Accounts will eventually sync Living Dex progress, hunts and settings between desktop and mobile.</p>
        <div className="auth-feature-list">
          <span>✓ Cloud collection saves</span>
          <span>✓ Cross-device progress</span>
          <span>✓ Private data by default</span>
        </div>
      </aside>
    </main>
  );
}
