import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { useGames } from '../hooks/useGames';
import { useStartedGameDexes } from '../hooks/useStartedGameDexes';

export function GameDexesPage() {
  const { games, loading, error } = useGames();
  const { startedGames } = useStartedGameDexes();
  const generations = [...new Set(games.map((game) => game.generation))];
  // Progress for the version you last played in each Dex you've started.
  const progressBySet = new Map(startedGames.map((game) => [game.id, game]));

  return (
    <main className="games-page">
      <PageHeader
        title="Game Dexes"
        description="Every game's own Pokédex, with versions that share a Dex grouped together and DLC Dexes kept separate."
      />

      {loading ? (
        <p className="dex-status">Loading games…</p>
      ) : error ? (
        <div className="dex-status dex-status--error"><strong>Games couldn't be loaded.</strong> <span>{error}</span></div>
      ) : games.length === 0 ? (
        <p className="dex-status">No Game Dexes have been imported yet.</p>
      ) : (
        <div className="games-list">
          {generations.map((generation) => (
            <section className="games-gen" key={generation} aria-labelledby={`gen-${generation}`}>
              <h2 id={`gen-${generation}`}>Generation {generation}</h2>
              <ul>
                {games.filter((game) => game.generation === generation).map((game) => (
                  <li key={game.id}>
                    <Link className={`game-card${game.scopeType === 'dlc' ? ' game-card--dlc' : ''}`} to={`/games/${game.slug}${progressBySet.has(game.id) ? `?version=${progressBySet.get(game.id)!.gameSlug}` : ''}`}>
                      <strong>{game.name}</strong>
                      <span className="game-card__region">
                        {game.regionLabel || 'Regional Pokédex'}
                        {game.scopeType === 'dlc' && <em>DLC</em>}
                      </span>
                      <span className="game-card__versions">{game.versions.map((version) => version.shortLabel).join(' · ')}</span>
                      {progressBySet.has(game.id) && (() => {
                        const started = progressBySet.get(game.id)!;
                        const pct = started.total ? Math.round((started.livingOwned / started.total) * 100) : 0;
                        return (
                          <span className="game-card__progress">
                            <span className="meter"><span style={{ width: `${pct}%` }} /></span>
                            <small>{started.livingOwned}/{started.total} in {started.gameName.replace(/^Pokémon\s*/i, '')}</small>
                          </span>
                        );
                      })()}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
