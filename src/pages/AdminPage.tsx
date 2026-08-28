import { useAuth } from '../context/AuthContext';

const adminSections = [
  ['Pokémon Data', 'Species, forms and National Dex metadata', 'Database editor comes next'],
  ['Games', 'Version groups and game-specific Dex definitions', 'Planned'],
  ['Locations', 'Routes, areas and acquisition methods', 'Planned'],
  ['Users', 'Account moderation and role management', 'Foundation ready'],
  ['Announcements', 'Bank reminders, release notes and site notices', 'Planned'],
  ['Site Settings', 'Feature flags and maintenance controls', 'Planned'],
];

export function AdminPage() {
  const { profile, user } = useAuth();

  return (
    <main className="admin-page">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">ADMIN CONTROL ROOM</p>
          <h1>DeviDex administration.</h1>
          <p>
            Signed in as <strong>{profile?.username || user?.email}</strong>. The route and database role foundation are now in place, so content editors can be added without exposing them to ordinary accounts.
          </p>
        </div>
        <div className="admin-badge"><span>✦</span> ADMIN</div>
      </section>

      <section className="admin-status-grid">
        <article><span>Authentication</span><strong>Connected</strong><small>Supabase session</small></article>
        <article><span>Your role</span><strong>{profile?.role ?? 'Unknown'}</strong><small>profiles.role</small></article>
        <article><span>Security</span><strong>RLS</strong><small>Database-enforced access</small></article>
      </section>

      <section className="section admin-section">
        <div className="section-heading"><div><p className="eyebrow">MANAGEMENT</p><h2>Admin modules</h2></div></div>
        <div className="admin-module-grid">
          {adminSections.map(([title, description, status]) => (
            <article className="admin-module" key={title}>
              <div className="admin-module__icon">✓</div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span>{status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-note">
        <strong>Security note</strong>
        <p>The Admin link is hidden from regular users, but that is only presentation. The SQL policies in <code>supabase/migrations/001_schema.sql</code> are what stop a non-admin account from editing protected data directly.</p>
      </section>
    </main>
  );
}
