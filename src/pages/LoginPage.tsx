import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, profile, loading, configured, signIn, signUp, resetPassword } = useAuth();
  const location = useLocation();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const returnTo = (location.state as { from?: string } | null)?.from ?? '/';
  if (user && !loading) {
    // New accounts go through the tiny profile setup before we send them back
    // to whatever page they originally wanted.
    return <Navigate to={profile?.username ? returnTo : '/account'} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);

    if (mode === 'forgot') {
      const result = await resetPassword(email);
      setSubmitting(false);
      setMessage(result.error ?? 'Password reset email sent. Open the link in that email to choose a new password.');
      return;
    }

    const result = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password);

    setSubmitting(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    if (mode === 'signup') {
      setMessage('Account created. Check your email to verify it, then finish your short DeviDex profile.');
      return;
    }

    // AuthContext receives the new session and the redirect above takes over.
  }

  const title = mode === 'signin'
    ? 'Sign in'
    : mode === 'signup'
      ? 'Create your account'
      : 'Reset your password';
  const intro = mode === 'signin'
    ? 'Pick up your collection on any device.'
    : mode === 'signup'
      ? 'Free. Saves your progress, and lets you add friends, chat and post.'
      : "We'll email you a link to choose a new password.";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <img src="/assets/logos/devidex-symbol.svg" alt="" width="44" height="44" />
          <div>
            <h1>{title}</h1>
            <p className="muted">{intro}</p>
          </div>
        </div>

        {!configured && (
          <div className="setup-notice">
            <strong>Accounts are unavailable right now.</strong>
            <p>You can still use the National Dex as a guest. Please try signing in again later.</p>
          </div>
        )}

        {mode !== 'forgot' && (
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button className={mode === 'signin' ? 'is-active' : ''} type="button" onClick={() => { setMode('signin'); setMessage(null); }}>Sign in</button>
            <button className={mode === 'signup' ? 'is-active' : ''} type="button" onClick={() => { setMode('signup'); setMessage(null); }}>Create account</button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" />
          </label>

          {mode !== 'forgot' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </label>
          )}

          {message && <p className="form-message" role="status">{message}</p>}

          <button className="button button--primary auth-submit" disabled={!configured || submitting}>
            {submitting
              ? 'Working…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset email'}
          </button>

          {mode === 'signin' && (
            <button className="text-button auth-secondary-action" type="button" onClick={() => { setMode('forgot'); setMessage(null); }}>
              Forgot password?
            </button>
          )}

          {mode === 'forgot' && (
            <button className="text-button auth-secondary-action" type="button" onClick={() => { setMode('signin'); setMessage(null); }}>
              ← Back to sign in
            </button>
          )}
        </form>
      </section>

    </main>
  );
}
