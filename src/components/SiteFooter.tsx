import { Link } from 'react-router-dom';

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <img src="/assets/logos/devidex-symbol.svg" alt="" aria-hidden="true" width="28" height="28" />
          <strong>DeviDex</strong>
        </div>

        <nav className="footer__links" aria-label="Footer">
          <Link to="/national-dex">National Dex</Link>
          <Link to="/games">Game Dexes</Link>
          <Link to="/forums">Forums</Link>
          <a href="mailto:devidex314@gmail.com">Report a bug or bad Dex entry</a>
        </nav>

        {/*
          Says what DeviDex is and is not, without pretending a footer grants a
          licence to third-party artwork. Sprite rights stay with their owners.
        */}
        <p className="footer__legal">
          DeviDex is an unofficial fan-made tracker, not affiliated with or endorsed by Nintendo,
          Game Freak, Creatures Inc. or The Pokémon Company. Pokémon names and sprites belong to their
          respective owners and are shown for identification. Sprites via the PokéAPI sprite repository.
        </p>
      </div>
    </footer>
  );
}
