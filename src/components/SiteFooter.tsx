export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <img src="/assets/logos/devidex-symbol.svg" alt="" aria-hidden="true" />
        <div>
          <strong>DeviDex</strong>
          <span>Track · Hunt · Complete</span>
        </div>
      </div>

      {/*
        This wording deliberately says what DeviDex is and is not without
        pretending that a footer magically grants us a licence to third-party
        artwork. The sprite/image rights remain with their respective owners.
      */}
      <p className="site-footer__legal">
        DeviDex is an unofficial, fan-made collection tracker and is not affiliated
        with or endorsed by Nintendo, Game Freak, Creatures Inc. or The Pokémon Company.
        Pokémon names, characters, images and sprites remain the property of their
        respective rights holders. Sprites are displayed for identification and
        reference purposes.
      </p>

      <div className="site-footer__contact">
        <span>Found a bug, bad Dex entry or other issue?</span>
        <a href="mailto:devidex314@gmail.com">devidex314@gmail.com</a>
        <small>Sprite imagery served via the PokéAPI sprite repository.</small>
      </div>
    </footer>
  );
}
