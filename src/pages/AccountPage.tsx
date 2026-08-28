import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AccountPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <main className="account-page">
      <section className="account-card">
        <div className="account-avatar">{(profile?.username || user?.email || 'DV').slice(0, 2).toUpperCase()}</div>
        <p className="eyebrow">YOUR DEVIDEX ACCOUNT</p>
        <h1>{profile?.username || 'Collector'}</h1>
        <dl className="account-details">
          <div><dt>Email</dt><dd>{user?.email}</dd></div>
          <div><dt>Role</dt><dd>{profile?.role || 'user'}</dd></div>
          <div><dt>Cloud sync</dt><dd>Authentication ready · collection sync next</dd></div>
        </dl>
        <button className="button button--secondary" type="button" onClick={handleSignOut}>Sign out</button>
      </section>
    </main>
  );
}
