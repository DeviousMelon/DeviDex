import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BankPrepCard } from '../components/BankCountdown';
import { BoxMosaic, BOX_SIZE, type CellState } from '../components/BoxMosaic';
import { PokemonSprite } from '../components/PokemonSprite';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useSocial } from '../context/SocialContext';
import { useDexCatalog } from '../hooks/useDexCatalog';
import { useStartedGameDexes } from '../hooks/useStartedGameDexes';
import { listForumPosts, type ForumPost } from '../lib/forums';
import { timeAgo } from '../lib/social';
import { collectionGoalLabel } from '../lib/collectionPresets';
import { storageOrder } from '../lib/boxes';

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function DashboardPage() {
  const { user } = useAuth();
  return user ? <SignedInDashboard /> : <Landing />;
}

// ---------------------------------------------------------------------------
// Signed in: what you have, what's next, who's talking
// ---------------------------------------------------------------------------

function SignedInDashboard() {
  const { profile } = useAuth();
  const { goal, activeCollection, presetId } = useFormPreferences();
  const { catalog, progress, stats, loading, error } = useDexCatalog();
  const { startedGames, loading: gamesLoading } = useStartedGameDexes();
  const { incomingRequests, unreadConversations } = useSocial();
  const [posts, setPosts] = useState<ForumPost[] | null>(null);

  useEffect(() => {
    void listForumPosts(null, 'new', 0).then((result) => setPosts(result.data.filter((post) => !post.authorBlocked).slice(0, 4)));
  }, []);

  const ordered = useMemo(() => storageOrder(catalog), [catalog]);
  const cells = useMemo<CellState[]>(() => ordered.map((entry) => {
    const row = progress[entry.formId];
    return row?.shinyOwned ? 'shiny' : row?.normalOwned ? 'owned' : 'missing';
  }), [ordered, progress]);

  const nextMissing = useMemo(
    () => ordered.filter((entry) => !progress[entry.formId]?.normalOwned).slice(0, 6),
    [ordered, progress],
  );

  const goalOwned = goal === 'shiny' ? stats.shinyOwned : goal === 'both' ? stats.livingOwned + stats.shinyOwned : stats.livingOwned;
  const goalTotal = goal === 'both' ? stats.total * 2 : stats.total;
  const collectionName = activeCollection?.name ?? (presetId === 'custom' ? 'Custom setup' : 'Your collection');
  const name = profile?.display_name || profile?.username;

  return (
    <main className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__text">
          <h1 id="home-title">{name ? `Welcome back, ${name}.` : 'Welcome back.'}</h1>
          <p>
            <Link to="/national-dex">{collectionName}</Link> · {collectionGoalLabel(goal)}
          </p>
        </div>

        <div className="home-hero__score">
          <strong>{percent(goalOwned, goalTotal)}<small>%</small></strong>
          <span>{goalOwned.toLocaleString()} of {goalTotal.toLocaleString()} {goal === 'shiny' ? 'shinies' : 'slots'}</span>
        </div>
      </section>

      <BankPrepCard />

      <section className="home-boxes" aria-labelledby="boxes-title">
        <div className="home-boxes__head">
          <h2 id="boxes-title">Your boxes</h2>
          <div className="box-legend" aria-hidden="true">
            <span><i className="box-mosaic__cell box-mosaic__cell--owned" /> Owned</span>
            <span><i className="box-mosaic__cell box-mosaic__cell--shiny" /> Shiny</span>
            <span><i className="box-mosaic__cell box-mosaic__cell--missing" /> Missing</span>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading your collection…</p>
        ) : error || cells.length === 0 ? (
          <p className="muted">The Pokédex couldn't be loaded right now. Refresh to try again.</p>
        ) : (
          <BoxMosaic
            cells={cells}
            boxHref={(index) => `/national-dex#box-${index + 1}`}
            firstNumberOfBox={(index) => ordered[index * BOX_SIZE]?.dexNumber ?? 0}
          />
        )}

        <div className="stat-inline home-boxes__stats">
          <div><strong>{stats.livingOwned.toLocaleString()}</strong><span>owned of {stats.total.toLocaleString()}</span></div>
          <div className="is-shiny"><strong>{stats.shinyOwned.toLocaleString()}</strong><span>shiny</span></div>
          <div><strong>{Math.max(stats.total - stats.livingOwned, 0).toLocaleString()}</strong><span>still missing</span></div>
          {stats.alternateForms > 0 && <div><strong>{stats.alternateForms.toLocaleString()}</strong><span>extra forms tracked</span></div>}
        </div>
      </section>

      <div className="home-grid">
        <section className="panel" aria-labelledby="next-title">
          <div className="panel__head">
            <h2 id="next-title">Next to find</h2>
            <Link to="/national-dex?filter=missing">All missing</Link>
          </div>
          {nextMissing.length === 0 ? (
            <p className="muted">{loading ? 'Loading…' : 'Nothing missing. Go and touch some grass.'}</p>
          ) : (
            <ul className="mini-dex">
              {nextMissing.map((entry) => (
                <li key={entry.formId}>
                  <Link to={`/pokemon/${entry.speciesSlug}${entry.isDefault ? '' : `?form=${encodeURIComponent(entry.formSlug)}`}`}>
                    <PokemonSprite nationalDexNumber={entry.dexNumber} name={entry.speciesName} spriteUrl={entry.spriteUrl} shinySpriteUrl={entry.shinySpriteUrl} />
                    <span>#{String(entry.dexNumber).padStart(4, '0')}</span>
                    <strong>{entry.isDefault ? entry.speciesName : entry.formName}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="games-title">
          <div className="panel__head">
            <h2 id="games-title">Game Dexes in progress</h2>
            <Link to="/games">All games</Link>
          </div>
          {gamesLoading ? (
            <p className="muted">Loading…</p>
          ) : startedGames.length === 0 ? (
            <p className="muted">
              None yet. Tick a Pokémon in any <Link to="/games">Game Dex</Link> and it shows up here.
            </p>
          ) : (
            <ul className="row-list">
              {startedGames.slice(0, 5).map((game) => (
                <li key={game.id}>
                  <Link to={`/games/${game.slug}?version=${game.gameSlug}`}>
                    <span className="row-list__main">
                      <strong>{game.name}</strong>
                      <small>{game.gameName.replace(/^Pokémon\s*/i, '')}{game.scopeType === 'dlc' ? ' (DLC)' : ''}</small>
                    </span>
                    <span className="row-list__meter" aria-label={`${game.livingOwned} of ${game.total}`}>
                      <span className="meter"><span style={{ width: `${percent(game.livingOwned, game.total)}%` }} /></span>
                      <small>{game.livingOwned}/{game.total}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="social-title">
          <div className="panel__head">
            <h2 id="social-title">Friends & forums</h2>
            <Link to="/forums">Forums</Link>
          </div>
          {(incomingRequests > 0 || unreadConversations > 0) && (
            <div className="home-alerts">
              {incomingRequests > 0 && (
                <Link to="/friends"><span className="badge">{incomingRequests}</span> friend {incomingRequests === 1 ? 'request' : 'requests'} waiting</Link>
              )}
              {unreadConversations > 0 && (
                <Link to="/chat"><span className="badge">{unreadConversations}</span> {unreadConversations === 1 ? 'chat' : 'chats'} with new messages</Link>
              )}
            </div>
          )}
          {posts == null ? (
            <p className="muted">Loading…</p>
          ) : posts.length === 0 ? (
            <p className="muted">The forums are quiet. <Link to="/forums/new">Start a thread</Link>.</p>
          ) : (
            <ul className="row-list row-list--posts">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link to={`/forums/post/${post.id}`}>
                    <span className="row-list__main">
                      <strong>{post.title}</strong>
                      <small>{post.categoryName} · {post.commentCount} {post.commentCount === 1 ? 'reply' : 'replies'} · {timeAgo(post.createdAt)}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Signed out: what DeviDex is, in one look
// ---------------------------------------------------------------------------

// A deterministic, decorative collection for the hero illustration only.
const DEMO_CELLS: CellState[] = Array.from({ length: BOX_SIZE * 6 }, (_, index) => {
  const n = (index * 7919) % 97;
  if (index > 150) return n % 3 === 0 ? 'owned' : 'missing';
  return n % 13 === 0 ? 'shiny' : n % 5 === 0 ? 'missing' : 'owned';
});

function Landing() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-hero__text">
          <h1>Your Living Dex, box by box.</h1>
          <p>
            Tick off every species, shiny and form in the order you actually store them. Follow each
            game's own Pokédex, keep backups, and trade with friends who are filling theirs.
          </p>
          <div className="landing-hero__actions">
            <Link className="button button--primary" to="/national-dex">Start tracking</Link>
            <Link className="button button--secondary" to="/login">Create a free account</Link>
          </div>
          <p className="landing-hero__note">No account needed to try it. Sign up to keep your progress.</p>
        </div>
        <BoxMosaic cells={DEMO_CELLS} animate className="landing-hero__mosaic" />
      </section>

      <BankPrepCard />

      <section className="landing-points" aria-label="What DeviDex does">
        <div>
          <h2>Every form, your rules</h2>
          <p>Regional forms, Vivillon patterns, gender differences, Megas: switch on only what counts for your Dex.</p>
        </div>
        <div>
          <h2>Each game's own Pokédex</h2>
          <p>Track Scarlet and Violet, Sword and Shield and the rest separately, with DLC Dexes kept apart.</p>
        </div>
        <div>
          <h2>Built for trading</h2>
          <p>Compare collections with friends, list your spares, and share a Pokémon straight into chat.</p>
        </div>
      </section>
    </main>
  );
}
