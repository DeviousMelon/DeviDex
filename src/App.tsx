import { Route, Routes } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { AccountPage } from './pages/AccountPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

function App() {
  return (
    <div className="app-shell">
      {/* Header/footer sit outside Routes, so the site's frame stays consistent. */}
      <SiteHeader />

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/collections" element={<PlaceholderPage eyebrow="COLLECTIONS" title="Living Dex collections" description="The collection engine is the next major data feature after authentication." />} />
        <Route path="/games" element={<PlaceholderPage eyebrow="GAME DEXES" title="Game-specific collections" description="Per-game tracking will live here without disturbing the core National Living Dex." />} />
        <Route path="/hunts" element={<PlaceholderPage eyebrow="HUNTS" title="Shiny hunt tracker" description="Active hunts, counters and targets will eventually be managed from this route." />} />

        {/* Any signed-in account can see /account. */}
        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

        {/* /admin additionally requires profiles.role === 'admin'. */}
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />

        <Route path="*" element={<PlaceholderPage eyebrow="404" title="That page escaped the Dex." description="The route does not exist yet." />} />
      </Routes>

      <SiteFooter />
    </div>
  );
}

export default App;
