import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { progressCards, recentPokemon } from '../data/samplePokemon';
import type { DexStatus, ProgressCardData } from '../types';

// Small helper: turns a number like 7 into "#0007".
// Keeping formatting logic in a function avoids repeating it in the JSX.
const formatDexNumber = (number: number) => `#${number.toString().padStart(4, '0')}`;

// Small helper for the human-readable label underneath each collection tile.
const statusLabel: Record<DexStatus, string> = {
  owned: 'Owned',
  missing: 'Missing',
  shiny: 'Shiny',
};

function ProgressCard({ card }: { card: ProgressCardData }) {
  // We calculate the percentage from current/total so the number never drifts out of sync.
  const percentage = Math.round((card.current / card.total) * 100);

  return (
    <article className={`progress-card progress-card--${card.tone}`}>
      <div className="progress-card__topline">
        <p>{card.label}</p>
        <strong>{percentage}%</strong>
      </div>

      <div className="progress-track" aria-label={`${card.label}: ${percentage}% complete`}>
        {/* CSS reads this custom property and uses it as the fill width. */}
        <span style={{ '--progress': `${percentage}%` } as CSSProperties} />
      </div>

      <div className="progress-card__numbers">
        <strong>{card.current.toLocaleString()}</strong>
        <span>/ {card.total.toLocaleString()}</span>
      </div>
      <p className="muted">{card.detail}</p>
    </article>
  );
}

export function DashboardPage() {
  const { user, profile } = useAuth();

  return (
      <main id="top">
        <section className="hero" id="dashboard">
          <div className="hero__copy">
            <p className="eyebrow">YOUR COLLECTION, PROPERLY TRACKED</p>
            <h1>The Living Dex tracker built for collectors.</h1>
            <p className="hero__intro">
              Track species, shinies, forms and game-specific collections without turning
              your spreadsheet into a second full-time job.
            </p>

            <div className="hero__actions">
              <Link className="button button--primary" to="/collections">Open Living Dex</Link>
              <Link className="button button--secondary" to="/collections?filter=missing">View Missing</Link>
            </div>
            {!user && (
              <p className="hero__account-note"><Link to="/login">Create an account</Link> when you want your collection to sync across devices.</p>
            )}
          </div>

          <aside className="hero-summary" aria-label="Today's collection summary">
            <div className="hero-summary__icon" aria-hidden="true">✓</div>
            <p className="eyebrow">{user ? 'WELCOME BACK' : "TODAY'S SNAPSHOT"}</p>
            <strong>{profile?.username || '79.2%'}</strong>
            <span>{user ? 'Your cloud session is connected' : 'National Living Dex complete'}</span>
            <div className="hero-summary__footer">
              <span>{user ? 'Progress syncing comes next' : '+6 this week'}</span>
              <span className="sparkle">✦</span>
            </div>
          </aside>
        </section>

        <section className="section" aria-labelledby="overview-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OVERVIEW</p>
              <h2 id="overview-title">Your Dexes</h2>
            </div>
            <Link className="text-button" to="/collections">Manage collections →</Link>
          </div>

          <div className="progress-grid">
            {progressCards.map((card) => (
              <ProgressCard key={card.label} card={card} />
            ))}
          </div>
        </section>

        <section className="section collection-panel" aria-labelledby="collection-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONTINUE COLLECTING</p>
              <h2 id="collection-title">National Living Dex</h2>
            </div>
            <div className="legend" aria-label="Collection status legend">
              <span><i className="legend-dot legend-dot--owned" />Owned</span>
              <span><i className="legend-dot legend-dot--shiny" />Shiny</span>
              <span><i className="legend-dot legend-dot--missing" />Missing</span>
            </div>
          </div>

          <div className="pokemon-grid">
            {recentPokemon.map((pokemon) => (
              <button
                className={`pokemon-tile pokemon-tile--${pokemon.status}`}
                key={pokemon.dexNumber}
                type="button"
                aria-label={`${pokemon.name}, ${statusLabel[pokemon.status]}`}
              >
                <span className="pokemon-tile__number">{formatDexNumber(pokemon.dexNumber)}</span>
                <span className="pokemon-tile__placeholder" aria-hidden="true">
                  {pokemon.name.slice(0, 2).toUpperCase()}
                </span>
                <strong>{pokemon.name}</strong>
                <span className="pokemon-tile__status">{statusLabel[pokemon.status]}</span>
              </button>
            ))}
          </div>

          <Link className="button button--wide" to="/collections">Open full National Dex</Link>
        </section>

        <section className="split-grid">
          <article className="feature-card">
            <div>
              <p className="eyebrow">ACTIVE HUNT</p>
              <h2>Shiny target</h2>
              <p className="muted">Keep your current hunt visible without burying it in another menu.</p>
            </div>
            <div className="hunt-target">
              <span className="hunt-target__star">✦</span>
              <div>
                <strong>Charmeleon</strong>
                <span>#0005 · FireRed</span>
              </div>
              <Link to="/hunts">View hunt</Link>
            </div>
          </article>

          <article className="feature-card">
            <div>
              <p className="eyebrow">QUICK ACCESS</p>
              <h2>Game Dexes</h2>
              <p className="muted">Jump back into whichever game you're currently ruining your free time with.</p>
            </div>
            <div className="game-list">
              <Link to="/games"><span>Platinum</span><strong>184 / 210</strong></Link>
              <Link to="/games"><span>Ultra Moon</span><strong>387 / 403</strong></Link>
              <Link to="/games"><span>Scarlet</span><strong>369 / 400</strong></Link>
            </div>
          </article>
        </section>
      </main>
  );
}
