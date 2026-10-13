import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { profileAvatarUrl } from '../lib/profile';

export function SiteHeader() {
  const { user, profile } = useAuth();
  const { incomingRequests, unreadConversations } = useSocial();
  const avatar = profileAvatarUrl(profile);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'is-active' : undefined;

  // Shared by the desktop pill nav and the scrollable strip on small screens,
  // which previously had no navigation at all.
  const links = (
    <>
      <NavLink end to="/" className={navClass}>Dashboard</NavLink>
      <NavLink to="/national-dex" className={navClass}>National Dex</NavLink>
      <NavLink to="/games" className={navClass}>Game Dexes</NavLink>
      <NavLink to="/hunts" className={navClass}>Hunts</NavLink>
      <NavLink to="/forums" className={navClass}>Forums</NavLink>
      {profile?.role === 'admin' && (
        <NavLink to="/admin" className={navClass}>Admin</NavLink>
      )}
    </>
  );

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label="DeviDex home">
        <img src="/assets/logos/devidex-logo-horizontal.svg" alt="DeviDex" />
      </Link>

      <nav className="desktop-nav" aria-label="Main navigation">{links}</nav>

      {user ? (
        <div className="header-actions">
          <NavLink
            to="/friends"
            className={({ isActive }) => `header-icon${isActive ? ' is-active' : ''}`}
            aria-label={incomingRequests ? `Friends, ${incomingRequests} new requests` : 'Friends'}
            title="Friends"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
              <circle cx="17" cy="9" r="2.6" />
              <path d="M16 14.6c2.8-.2 5 1.4 5.5 4.4" />
            </svg>
            {incomingRequests > 0 && <span className="badge">{incomingRequests > 9 ? '9+' : incomingRequests}</span>}
          </NavLink>
          <NavLink
            to="/chat"
            className={({ isActive }) => `header-icon${isActive ? ' is-active' : ''}`}
            aria-label={unreadConversations ? `Chats, ${unreadConversations} unread` : 'Chats'}
            title="Chats"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5.5h16v10H9l-5 4z" />
            </svg>
            {unreadConversations > 0 && <span className="badge">{unreadConversations > 9 ? '9+' : unreadConversations}</span>}
          </NavLink>
          <Link className="profile-button" to="/account" aria-label="Open account">
            {avatar
              ? <img src={avatar} alt="" />
              : (profile?.username || user.email || 'DV').slice(0, 2).toUpperCase()}
          </Link>
        </div>
      ) : (
        <Link className="header-login" to="/login">Sign in</Link>
      )}

      <nav className="mobile-nav" aria-label="Main navigation">{links}</nav>
    </header>
  );
}
