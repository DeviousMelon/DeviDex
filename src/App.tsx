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
import { FriendsPage } from './pages/FriendsPage';
import { ComparePage } from './pages/ComparePage';
import { TradeListPage } from './pages/TradeListPage';
import { ChatPage } from './pages/ChatPage';
import { ForumsPage } from './pages/ForumsPage';
import { ForumPostPage } from './pages/ForumPostPage';
import { NewForumPostPage } from './pages/NewForumPostPage';

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

        {/* Public user pages. */}
        <Route path="/u/:username" element={<PublicProfilePage />} />

        <Route path="/hunts" element={<PlaceholderPage title="Shiny hunts are coming" description="Encounter counters, odds and targets for each game. Not ready yet." />} />

        {/* Social (v1.6–v1.9). Forums are readable signed out; the rest need an account. */}
        <Route path="/friends" element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
        <Route path="/friends/:username" element={<ProtectedRoute><ComparePage /></ProtectedRoute>} />
        <Route path="/trades" element={<ProtectedRoute><TradeListPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/chat/:conversationId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/forums" element={<ForumsPage />} />
        <Route path="/forums/new" element={<ProtectedRoute><NewForumPostPage /></ProtectedRoute>} />
        <Route path="/forums/post/:postId" element={<ForumPostPage />} />
        <Route path="/forums/:category" element={<ForumsPage />} />

        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />

        <Route path="*" element={<PlaceholderPage title="Page not found" description="That page escaped the Dex. Check the address, or head back home." />} />
      </Routes>

      <SiteFooter />
    </div>
  );
}

export default App;
