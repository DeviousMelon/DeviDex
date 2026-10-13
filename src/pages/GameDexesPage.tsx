import { Link } from 'react-router-dom';
import { useGames } from '../hooks/useGames';

export function GameDexesPage() {
  const { games, loading, error } = useGames();
  const generations = [...new Set(games.map((game) => game.generation))];

  return (
    <main className="game-dexes-page">
      <section className="game-dexes-hero">
        <p className="eyebrow">GAME DEXES</p>
        <h1>One Pokédex, all of its versions.</h1>
        <p>
          Games that share the same regional Pokédex now live together. Pick the version whose save you are tracking inside the Dex, while DLC gets its own proper Pokédex instead of being stuffed into the base game and politely ignored.
        </p>
      </section>

      {loading ? (
        <section className="dex-empty-state"><strong>Loading shared Game Dexes…</strong></section>
      ) : error ? (
        <section className="dex-empty-state dex-empty-state--error"><strong>{error}</strong><p>Run the v1.1 Supabase migration first if these tables do not exist yet.</p></section>
      ) : (
        generations.map((generation) => (
          <section className="game-generation" key={generation}>
            <div className="section-heading">
              <div><p className="eyebrow">GENERATION {generation}</p><h2>Game Dexes</h2></div>
            </div>
            <div className="game-dex-card-grid">
              {games.filter((game) => game.generation === generation).map((game) => (
                <Link className={`game-dex-card${game.scopeType === 'dlc' ? ' game-dex-card--dlc' : ''}`} to={`/games/${game.slug}`} key={game.id}>
                  <div className="game-dex-card__topline">
                    <span className="game-dex-card__generation">Gen {game.generation}</span>
                    {game.scopeType === 'dlc' && <span className="game-dex-card__scope">DLC</span>}
                  </div>
                  <strong>{game.name}</strong>
                  <span className="game-dex-card__region">{game.regionLabel || 'Regional Pokédex'}</span>
                  <div className="game-version-chips" aria-label="Versions in this shared Dex">
                    {game.versions.map((version) => <span key={version.id}>{version.shortLabel}</span>)}
                  </div>
                  <span>Open shared collection →</span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
