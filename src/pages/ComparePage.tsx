import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PokemonSprite } from '../components/PokemonSprite';
import { UserAvatar } from '../components/UserAvatar';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import { socialName, type SocialUser } from '../lib/social';
import { compareCollectionWithFriend, getFriendCompareInfo, type CompareRow, type CompareStatus } from '../lib/trades';
import type { DexCatalogEntry } from '../types';

type Mode = 'normal' | 'shiny';
type Tab = 'trades' | 'they-have' | 'you-have';

const EMPTY_ROW: Omit<CompareRow, 'formId'> = {
  myNormal: false, myShiny: false, theirNormal: false, theirShiny: false,
  iOfferNormal: false, iOfferShiny: false, theyOfferNormal: false, theyOfferShiny: false,
};

const PREVIEW_LIMIT = 120;

/**
 * Side-by-side comparison with one friend. "Missing" is measured against YOUR
 * form rules (the categories you track), since that is the Dex you are filling.
 */
export function ComparePage() {
  const { username = '' } = useParams();
  const { categoryEnabled } = useFormPreferences();
  const { catalog, error: catalogError } = usePokemonCatalog();
  const [status, setStatus] = useState<CompareStatus | null>(null);
  const [friend, setFriend] = useState<SocialUser | null>(null);
  const [rows, setRows] = useState<Map<number, CompareRow>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('normal');
  const [tab, setTab] = useState<Tab>('trades');

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    void getFriendCompareInfo(username).then(async (info) => {
      if (cancelled) return;
      setFriend(info.data.friend);
      setStatus(info.data.status);
      setError(info.error);
      if (info.data.status !== 'ok') return;
      const compared = await compareCollectionWithFriend(username);
      if (cancelled) return;
      setRows(new Map(compared.data.map((row) => [row.formId, row])));
      setError(compared.error);
    });
    return () => { cancelled = true; };
  }, [username]);

  const tracked = useMemo(
    () => (catalog?.entries ?? []).filter((entry) => entry.formCategory === 'default' || categoryEnabled(entry.formCategory)),
    [catalog, categoryEnabled],
  );

  const lists = useMemo(() => {
    const shiny = mode === 'shiny';
    const get = (entry: DexCatalogEntry) => ({ ...EMPTY_ROW, ...rows.get(entry.formId) });
    const mine = (row: typeof EMPTY_ROW) => (shiny ? row.myShiny : row.myNormal);
    const theirs = (row: typeof EMPTY_ROW) => (shiny ? row.theirShiny : row.theirNormal);
    const iOffer = (row: typeof EMPTY_ROW) => (shiny ? row.iOfferShiny : row.iOfferNormal);
    const theyOffer = (row: typeof EMPTY_ROW) => (shiny ? row.theyOfferShiny : row.theyOfferNormal);

    const result = {
      myCount: 0,
      theirCount: 0,
      theyCanGive: [] as DexCatalogEntry[],
      youCanGive: [] as DexCatalogEntry[],
      theyHave: [] as DexCatalogEntry[],
      youHave: [] as DexCatalogEntry[],
    };

    for (const entry of tracked) {
      const row = get(entry);
      if (mine(row)) result.myCount += 1;
      if (theirs(row)) result.theirCount += 1;
      if (theyOffer(row) && !mine(row)) result.theyCanGive.push(entry);
      if (iOffer(row) && !theirs(row)) result.youCanGive.push(entry);
      if (theirs(row) && !mine(row)) result.theyHave.push(entry);
      if (mine(row) && !theirs(row)) result.youHave.push(entry);
    }
    return result;
  }, [mode, rows, tracked]);

  if (status === null) {
    return <main className="social-page"><p className="muted">Loading…</p></main>;
  }

  if (status !== 'ok' || !friend) {
    return (
      <main className="social-page">
        <section className="dex-empty-state">
          <strong>
            {status === 'private'
              ? `@${friend?.username ?? username} keeps their collection private.`
              : `You can only compare with friends.`}
          </strong>
          <p>
            {status === 'private'
              ? 'They can turn on “Friends can see my collection” on their Account page.'
              : 'Send them a friend request first.'}
          </p>
          <Link className="button button--secondary" to="/friends">Back to friends</Link>
        </section>
      </main>
    );
  }

  const shinyFlag = mode === 'shiny' ? '&shiny=1' : '';
  const chatLink = (entry: DexCatalogEntry) => `/chat?with=${encodeURIComponent(friend.username)}&share=${entry.formId}${shinyFlag}`;
  const total = tracked.length;
  const percent = (count: number) => (total ? Math.round((count / total) * 100) : 0);

  return (
    <main className="social-page">
      <section className="compare-hero">
        <Link className="text-button" to="/friends">← Friends</Link>
        <div className="compare-hero__people">
          <UserAvatar user={friend} size="lg" />
          <div>
            <p className="eyebrow">COMPARE & TRADE</p>
            <h1>You and {socialName(friend)}</h1>
            <p className="muted">Measured against the forms you track. <Link to="/trades">Edit your trade list</Link></p>
          </div>
        </div>
        <div className="compare-stats">
          <div><span>You</span><strong>{lists.myCount.toLocaleString()} / {total.toLocaleString()}</strong><small>{percent(lists.myCount)}%</small></div>
          <div><span>@{friend.username}</span><strong>{lists.theirCount.toLocaleString()} / {total.toLocaleString()}</strong><small>{percent(lists.theirCount)}%</small></div>
          <div className="segmented" role="group" aria-label="Normal or shiny">
            <button type="button" className={mode === 'normal' ? 'is-active' : undefined} onClick={() => setMode('normal')}>Living</button>
            <button type="button" className={mode === 'shiny' ? 'is-active' : undefined} onClick={() => setMode('shiny')}>✦ Shiny</button>
          </div>
        </div>
      </section>

      {(error || catalogError) && <p className="form-message form-message--error">{error ?? catalogError}</p>}

      <div className="compare-tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'trades'} onClick={() => setTab('trades')}>
          Trade matches <span className="social-count">{lists.theyCanGive.length + lists.youCanGive.length}</span>
        </button>
        <button role="tab" type="button" aria-selected={tab === 'they-have'} onClick={() => setTab('they-have')}>
          They have, you don't <span className="social-count">{lists.theyHave.length}</span>
        </button>
        <button role="tab" type="button" aria-selected={tab === 'you-have'} onClick={() => setTab('you-have')}>
          You have, they don't <span className="social-count">{lists.youHave.length}</span>
        </button>
      </div>

      {!catalog ? (
        <p className="muted">Loading Pokémon…</p>
      ) : tab === 'trades' ? (
        <>
          <CompareGrid
            title={`On @${friend.username}'s trade list, missing from yours`}
            empty="Nothing on their trade list that you need yet."
            entries={lists.theyCanGive}
            shiny={mode === 'shiny'}
            action={(entry) => <Link className="text-button" to={chatLink(entry)}>Ask in chat</Link>}
          />
          <CompareGrid
            title={`On your trade list, missing from @${friend.username}'s`}
            empty={<>Nothing to offer them yet. <Link to="/trades">Add spares to your trade list.</Link></>}
            entries={lists.youCanGive}
            shiny={mode === 'shiny'}
            action={(entry) => <Link className="text-button" to={chatLink(entry)}>Offer in chat</Link>}
          />
        </>
      ) : tab === 'they-have' ? (
        <CompareGrid
          title="They might be able to help"
          hint="They own these, but haven't listed spares. Worth asking: many can be bred."
          empty="They don't have anything you're missing. Show-off."
          entries={lists.theyHave}
          shiny={mode === 'shiny'}
          action={(entry) => <Link className="text-button" to={chatLink(entry)}>Ask</Link>}
        />
      ) : (
        <CompareGrid
          title="You might be able to help"
          empty="You don't have anything they're missing."
          entries={lists.youHave}
          shiny={mode === 'shiny'}
          action={(entry) => <Link className="text-button" to={chatLink(entry)}>Offer</Link>}
        />
      )}
    </main>
  );
}

function CompareGrid({ title, hint, empty, entries, shiny, action }: {
  title: string;
  hint?: string;
  empty: ReactNode;
  entries: DexCatalogEntry[];
  shiny: boolean;
  action: (entry: DexCatalogEntry) => ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, PREVIEW_LIMIT);

  return (
    <section className="social-section">
      <h2>{title} <span className="social-count">{entries.length}</span></h2>
      {hint && <p className="muted">{hint}</p>}
      {entries.length === 0 ? (
        <div className="social-empty"><span>{empty}</span></div>
      ) : (
        <>
          <ul className="compare-grid">
            {visible.map((entry) => (
              <li key={entry.formId}>
                <PokemonSprite
                  nationalDexNumber={entry.dexNumber}
                  name={pokemonLabel(entry)}
                  shiny={shiny}
                  spriteUrl={entry.spriteUrl}
                  shinySpriteUrl={entry.shinySpriteUrl}
                />
                <small>#{entry.dexNumber}</small>
                <Link to={`/pokemon/${entry.speciesSlug}`}>{pokemonLabel(entry)}</Link>
                {action(entry)}
              </li>
            ))}
          </ul>
          {entries.length > PREVIEW_LIMIT && (
            <button className="button button--secondary" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer' : `Show all ${entries.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
