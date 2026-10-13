import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { profileAvatarUrl } from '../lib/profile';

export function SiteHeader() {
  const { user, profile } = useAuth();
  const avatar = profileAvatarUrl(profile);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'is-active' : undefined;

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label="DeviDex home">
        <img src="/assets/logos/devidex-logo-horizontal.svg" alt="DeviDex" />
      </Link>

      <nav className="desktop-nav" aria-label="Main navigation">
        <NavLink end to="/" className={navClass}>Dashboard</NavLink>
        <NavLink to="/national-dex" className={navClass}>National Dex</NavLink>
        <NavLink to="/games" className={navClass}>Game Dexes</NavLink>
        <NavLink to="/hunts" className={navClass}>Hunts</NavLink>
        {profile?.role === 'admin' && (
          <NavLink to="/admin" className={navClass}>Admin</NavLink>
        )}
      </nav>

      {user ? (
        <Link className="profile-button" to="/account" aria-label="Open account">
          {avatar
            ? <img src={avatar} alt="" />
            : (profile?.username || user.email || 'DV').slice(0, 2).toUpperCase()}
        </Link>
      ) : (
        <Link className="header-login" to="/login">Sign in</Link>
      )}
    </header>
  );
}
