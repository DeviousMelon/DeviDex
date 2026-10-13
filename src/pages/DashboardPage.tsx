import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { PokemonSprite } from '../components/PokemonSprite';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useDexCatalog } from '../hooks/useDexCatalog';
import { useStartedGameDexes } from '../hooks/useStartedGameDexes';
import { progressCards as demoProgressCards } from '../data/samplePokemon';
import type { DexStatus, ProgressCardData } from '../types';

const formatDexNumber = (number: number) => `#${number.toString().padStart(4, '0')}`;

const statusLabel: Record<DexStatus, string> = {
  owned: 'Owned',
  missing: 'Missing',
  shiny: 'Shiny',
};

function ProgressCard({ card }: { card: ProgressCardData }) {
  const percentage = card.total ? Math.round((card.current / card.total) * 100) : 0;

  return (
    <article className={`progress-card progress-card--${card.tone}`}>
      <div className="progress-card__topline">
        <p>{card.label}</p>
        <strong>{percentage}%</strong>
      </div>
      <div className="progress-track" aria-label={`${card.label}: ${percentage}% complete`}>
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
  const { goal, activeCollection, presetId } = useFormPreferences();
  const { catalog, progress, stats, loading } = useDexCatalog();
  const { startedGames, loading: startedGamesLoading } = useStartedGameDexes();

  const databaseReady = catalog.length > 0;

  // Public visitors now see the REAL catalogue and can mark temporary progress,
  // so there is no need to fake a sample collection once the database exists.
  const progressCards: ProgressCardData[] = databaseReady
    ? [
        {
          label: 'National Living Dex',
          current: stats.livingOwned,
          total: stats.total,
          detail: `${Math.max(stats.total - stats.livingOwned, 0)} entries remaining`,
          tone: 'blue',
        },
        {
          label: 'Shiny Living Dex',
          current: stats.shinyOwned,
          total: stats.total,
          detail: `${Math.max(stats.total - stats.shinyOwned, 0)} shinies remaining`,
          tone: 'gold',
        },
        {
          label: 'Extra Forms Included',
          current: stats.alternateForms,
          total: Math.max(stats.availableAlternateForms, 1),
          detail: stats.availableAlternateForms
            ? `${stats.availableAlternateForms - stats.alternateForms} optional form slots currently excluded`
            : 'Run the Phase 4 form importer from Admin to add optional forms',
          tone: 'orange',
        },
      ]
    : demoProgressCards;

  const recentPokemon = databaseReady
    ? catalog.slice(0, 12).map((entry) => {
        const row = progress[entry.formId];
        const status: DexStatus = row?.shinyOwned
          ? 'shiny'
          : row?.normalOwned
            ? 'owned'
            : 'missing';
        return {
          formId: entry.formId,
          dexNumber: entry.dexNumber,
          name: entry.isDefault ? entry.speciesName : `${entry.speciesName} · ${entry.formName}`,
          status,
          spriteUrl: entry.spriteUrl,
          shinySpriteUrl: entry.shinySpriteUrl,
        };
      })
    : [];

  const goalOwned = goal === 'shiny'
    ? stats.shinyOwned
    : goal === 'both'
      ? stats.livingOwned + stats.shinyOwned
      : stats.livingOwned;
  const goalTotal = goal === 'both' ? stats.total * 2 : stats.total;
  const overallPercent = goalTotal
    ? Math.round((goalOwned / goalTotal) * 100)
    : 0;
  const activeCollectionLabel = activeCollection?.name
    ?? (presetId === 'custom' ? 'Custom collection' : 'Current collection');

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
            <Link className="button button--primary" to="/national-dex">Open National Dex</Link>
            <Link className="button button--secondary" to="/national-dex?filter=missing">View Missing</Link>
          </div>
          {!user && (
            <p className="hero__account-note">
              Guest progress works for this session only. <Link to="/login">Create an account</Link> when you want it saved.
            </p>
          )}
        </div>

        <aside className="hero-summary" aria-label="Collection summary">
          <div className="hero-summary__icon" aria-hidden="true">✓</div>
          <p className="eyebrow">{user ? activeCollectionLabel.toUpperCase() : 'GUEST SESSION'}</p>
          <strong>{databaseReady ? `${overallPercent}%` : profile?.username || '—'}</strong>
          <span>{databaseReady
            ? goal === 'shiny'
              ? `${stats.shinyOwned} of ${stats.total} shiny entries completed`
              : goal === 'both'
                ? `${stats.livingOwned + stats.shinyOwned} of ${stats.total * 2} living + shiny goals completed`
                : `${stats.livingOwned} of ${stats.total} Living Dex entries owned`
            : loading ? 'Loading the National Dex…' : 'National Dex data is not ready yet'}</span>
          <div className="hero-summary__footer">
            <span>{user ? 'Cloud progress enabled' : 'Temporary progress only'}</span>
            <span className="sparkle">✦</span>
          </div>
        </aside>
      </section>

      <section className="section" id="progress">
        <div className="section-heading">
          <div>
            <p className="eyebrow">COLLECTION OVERVIEW</p>
            <h2>{user ? 'Your progress' : 'Your guest-session progress'}</h2>
          </div>
        </div>
        <div className="progress-grid">
          {progressCards.map((card) => <ProgressCard card={card} key={card.label} />)}
        </div>
      </section>

      <section className="section" id="living-dex">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NATIONAL DEX</p>
            <h2>See the collection at a glance</h2>
          </div>
          <div className="legend" aria-label="Collection status legend">
            <span><i className="legend-dot" /> Owned</span>
            <span><i className="legend-dot legend-dot--shiny" /> Shiny</span>
            <span><i className="legend-dot legend-dot--missing" /> Missing</span>
          </div>
        </div>

        {recentPokemon.length > 0 ? (
          <div className="pokemon-grid">
            {recentPokemon.map((pokemon) => {
              const showShiny = pokemon.status === 'shiny';

              return (
                <Link
                  className={`pokemon-tile pokemon-tile--${pokemon.status}`}
                  key={pokemon.formId}
                  to="/national-dex"
                  aria-label={`${pokemon.name}, ${statusLabel[pokemon.status]}`}
                >
                  <span className="pokemon-tile__number">{formatDexNumber(pokemon.dexNumber)}</span>

                  <span className="pokemon-tile__visual">
                    {/* No initials behind transparent pixels. Fallback only appears on a real image error. */}
                    <PokemonSprite
                      className="pokemon-tile__sprite"
                      nationalDexNumber={pokemon.dexNumber}
                      name={pokemon.name}
                      shiny={showShiny}
                      spriteUrl={pokemon.spriteUrl}
                      shinySpriteUrl={pokemon.shinySpriteUrl}
                    />
                    {showShiny && <span className="pokemon-tile__sparkle" aria-hidden="true">✦</span>}
                  </span>

                  <strong>{pokemon.name}</strong>
                  <span className="pokemon-tile__status">{statusLabel[pokemon.status]}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <section className="dex-empty-state"><strong>Loading Pokémon sprites…</strong></section>
        )}

        <Link className="button button--wide" to="/national-dex">Open full National Dex</Link>
      </section>

      <section className="split-grid">
        <article className="feature-card">
          <div>
            <p className="eyebrow">ACTIVE HUNT</p>
            <h2>Shiny target</h2>
            <p className="muted">Hunt tracking has its place reserved; we are leaving the feature alone until the core public Dex is further along.</p>
          </div>
          <div className="hunt-target">
            <span className="hunt-target__star">✦</span>
            <div>
              <strong>Hunt tracking arrives later</strong>
              <span>Targets, counters and game methods</span>
            </div>
            <Link to="/hunts">Hunts</Link>
          </div>
        </article>

        <article className="feature-card">
          <div>
            <p className="eyebrow">YOUR GAME COLLECTIONS</p>
            <h2>Started Game Dexes</h2>
            <p className="muted">Only games where you have actually marked at least one Pokémon appear here.</p>
          </div>

          {startedGamesLoading ? (
            <p className="muted">Loading started games…</p>
          ) : startedGames.length > 0 ? (
            <div className="started-game-list">
              {startedGames.slice(0, 6).map((game) => (
                <Link className="started-game-row" to={`/games/${game.slug}?version=${game.gameSlug}`} key={game.id}>
                  <span>
                    <strong>{game.name}</strong>
                    <small>Gen {game.generation}{game.scopeType === 'dlc' ? ' · DLC' : ''} · {game.gameName.replace(/^Pokémon\s*/i, '')} · {game.livingOwned} owned{game.shinyOwned ? ` · ${game.shinyOwned} shiny` : ''}</small>
                  </span>
                  <strong aria-hidden="true">→</strong>
                </Link>
              ))}
            </div>
          ) : (
            <div className="started-games-empty">
              <strong>No Game Dexes started yet.</strong>
              <p>Mark one Pokémon in any Game Dex and that game will appear here.</p>
              <Link className="button button--secondary" to="/games">Browse Game Dexes</Link>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
