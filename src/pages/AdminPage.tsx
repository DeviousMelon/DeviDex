import { AdminDataTools } from '../components/AdminDataTools';
import { AdminReports } from '../components/AdminReports';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';

/**
 * Admin tools. The route guard only hides this page; the real protection is
 * PostgreSQL, where every admin action checks public.is_admin().
 */
export function AdminPage() {
  const { profile, user } = useAuth();

  return (
    <main className="admin">
      <PageHeader
        title="Admin"
        description={<>Signed in as <strong>{profile?.username || user?.email}</strong>. Reports first, then the Pokédex data tools.</>}
      />
      <AdminReports />
      <AdminDataTools />
    </main>
  );
}
