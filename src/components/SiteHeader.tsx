import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { profileAvatarUrl } from '../lib/profile';
import { useNow } from '../hooks/useNow';
import { bankIsOpen, timeLeft } from '../lib/bank';

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : undefined);

export function SiteHeader() {
  const { user, profile, signOut } = useAuth();
  const { incomingRequests, unreadConversations } = useSocial();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const avatar = profileAvatarUrl(profile);
  const initials = (profile?.username || user?.email || 'DV').slice(0, 2).toUpperCase();
  const isAdmin = profile?.role === 'admin';
  // The Bank link is temporary: it leaves the nav once Bank has closed.
  // /bank itself stays up as a record.
  const now = useNow(60_000);
  const bankOpen = bankIsOpen(now);
  const bankDays = timeLeft(now).days;

  // Close both menus whenever the page changes.
  useEffect(() => {
    setMenuOpen(false);
    profileMenu.current?.removeAttribute('open');
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('menu-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('menu-open');
    };
  }, [menuOpen]);

  const primaryLinks = (
    <>
      <NavLink to="/national-dex" className={navClass}>National Dex</NavLink>
      <NavLink to="/games" className={navClass}>Game Dexes</NavLink>
      <NavLink to="/tools" className={navClass}>Tools</NavLink>
      <NavLink to="/forums" className={navClass}>Forums</NavLink>
      {bankOpen && (
        <NavLink to="/bank" className={navClass} aria-label={`Bank shutdown, ${bankDays} days left`}>
          Bank <span className="nav-countdown" aria-hidden="true">{bankDays}d</span>
        </NavLink>
      )}
      {isAdmin && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
    </>
  );

  return (
    <>
    <header className="topbar">
      <div className="topbar__inner">
        <Link className="topbar__brand" to="/" aria-label="DeviDex home">
          <img src="/assets/logos/devidex-logo-horizontal.svg" alt="DeviDex" width="150" height="40" />
        </Link>

        <nav className="topbar__nav" aria-label="Main">{primaryLinks}</nav>

        <div className="topbar__actions">
          {user ? (
            <>
              <NavLink
                to="/friends"
                className={({ isActive }) => `icon-button${isActive ? ' is-active' : ''}`}
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
                className={({ isActive }) => `icon-button${isActive ? ' is-active' : ''}`}
                aria-label={unreadConversations ? `Chats, ${unreadConversations} unread` : 'Chats'}
                title="Chats"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z" /></svg>
                {unreadConversations > 0 && <span className="badge">{unreadConversations > 9 ? '9+' : unreadConversations}</span>}
              </NavLink>

              <details className="profile-menu" ref={profileMenu}>
                <summary aria-label="Your account menu">
                  <span className="profile-menu__avatar">{avatar ? <img src={avatar} alt="" /> : initials}</span>
                </summary>
                <div className="profile-menu__panel">
                  <p className="profile-menu__who">
                    <strong>{profile?.display_name || profile?.username || 'Your account'}</strong>
                    {profile?.username && <span>@{profile.username}</span>}
                  </p>
                  <Link to="/account">Account & privacy</Link>
                  <Link to="/trades">Trade list</Link>
                  {profile?.username && profile.profile_public && (
                    <Link to={`/u/${encodeURIComponent(profile.username)}`}>Public profile</Link>
                  )}
                  <button type="button" onClick={() => void signOut()}>Sign out</button>
                </div>
              </details>
            </>
          ) : (
            <Link className="button button--secondary button--small topbar__signin" to="/login">Sign in</Link>
          )}

          <button
            className="icon-button topbar__menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>

      {/* Outside <header>: its backdrop blur would trap position:fixed. */}
      {menuOpen && (
        <nav className="mobile-menu" id="mobile-menu" aria-label="Main">
          <NavLink end to="/" className={navClass}>Home</NavLink>
          {primaryLinks}
          {user ? (
            <>
              <hr />
              <NavLink to="/friends" className={navClass}>
                Friends {incomingRequests > 0 && <span className="badge">{incomingRequests}</span>}
              </NavLink>
              <NavLink to="/chat" className={navClass}>
                Chats {unreadConversations > 0 && <span className="badge">{unreadConversations}</span>}
              </NavLink>
              <NavLink to="/trades" className={navClass}>Trade list</NavLink>
              <NavLink to="/account" className={navClass}>Account & privacy</NavLink>
              <button type="button" onClick={() => void signOut()}>Sign out</button>
            </>
          ) : (
            <>
              <hr />
              <NavLink to="/login" className={navClass}>Sign in or create an account</NavLink>
            </>
          )}
        </nav>
      )}
    </>
  );
}
