import { AdminDataTools } from '../components/AdminDataTools';
import { AdminReports } from '../components/AdminReports';
import { useAuth } from '../context/AuthContext';

const adminSections = [
  ['Pokémon Data', 'Species, forms and National Dex metadata', 'v0.4 active'],
  ['Games', 'Version groups and game-specific Dex definitions', 'v0.4 active'],
  ['Locations', 'Routes, areas and acquisition methods', 'Planned'],
  ['Users', 'Account moderation and role management', 'Reports active'],
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
            Signed in as <strong>{profile?.username || user?.email}</strong>. Shared Pokémon
            data now lives in PostgreSQL, while every user's collection remains private to them.
          </p>
        </div>
        <div className="admin-badge"><span>✦</span> ADMIN</div>
      </section>

      <section className="admin-status-grid">
        <article><span>Authentication</span><strong>Connected</strong><small>Supabase session</small></article>
        <article><span>Your role</span><strong>{profile?.role ?? 'Unknown'}</strong><small>profiles.role</small></article>
        <article><span>Collection security</span><strong>Private</strong><small>Per-user RLS</small></article>
      </section>

      {/* The importer lives inside the protected admin route. RLS also checks
          the admin role at the database layer before accepting any write. */}
      <AdminReports />

      <AdminDataTools />

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
        <p>
          The Admin link being hidden is only presentation. PostgreSQL policies call
          <code>public.is_admin()</code> before shared master data can be changed, and user
          collection rows can only be read or written by their owner.
        </p>
      </section>
    </main>
  );
}
