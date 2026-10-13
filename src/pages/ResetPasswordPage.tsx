import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ResetPasswordPage() {
  const { user, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await updatePassword(password);
    setSaving(false);
    setMessage(result.error ?? 'Password updated. You can carry on using DeviDex.');
    if (!result.error) setPassword('');
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--narrow">
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>Choose a new password.</h1>
        {!user ? (
          <p className="muted">Open this page using the password-reset link Supabase emailed you. The link creates the temporary recovery session needed to change your password.</p>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              New password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" />
            </label>
            {message && <p className="form-message" role="status">{message}</p>}
            <button className="button button--primary" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
          </form>
        )}
        <Link className="text-button" to="/">Back to DeviDex</Link>
      </section>
    </main>
  );
}
