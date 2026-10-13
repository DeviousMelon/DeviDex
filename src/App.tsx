import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AdminPage } from './pages/AdminPage';
import { AccountPage } from './pages/AccountPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { GameDexesPage } from './pages/GameDexesPage';
import { GameDexPage } from './pages/GameDexPage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import { PokemonDetailPage } from './pages/PokemonDetailPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

function LegacyCollectionsRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/national-dex', search: location.search }} replace />;
}

function App() {
  return (
    <div className="app-shell">
      <SiteHeader />

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* The actual trackers are public. Guests get temporary in-memory progress. */}
        <Route path="/national-dex" element={<CollectionsPage />} />
        <Route path="/collections" element={<LegacyCollectionsRedirect />} />
        <Route path="/games" element={<GameDexesPage />} />
        <Route path="/games/:gameSlug" element={<GameDexPage />} />
        <Route path="/pokemon/:speciesSlug" element={<PokemonDetailPage />} />

        {/* Public user pages exist now; forum/community features still do not. */}
        <Route path="/u/:username" element={<PublicProfilePage />} />

        <Route path="/hunts" element={<PlaceholderPage eyebrow="HUNTS" title="Shiny hunt tracker" description="Active hunts, counters and targets will eventually be managed from this route." />} />

        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />

        <Route path="*" element={<PlaceholderPage eyebrow="404" title="That page escaped the Dex." description="The route does not exist yet." />} />
      </Routes>

      <SiteFooter />
    </div>
  );
}

export default App;
