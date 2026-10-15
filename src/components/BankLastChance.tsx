import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import {
  getLastChanceList,
  getMyLastChanceTicks,
  LAST_CHANCE_CATEGORIES,
  setLastChanceTick,
  type LastChanceEntry,
} from '../lib/bank';
import { PokemonSprite } from './PokemonSprite';

/** The admin-curated "get these before Bank closes" list. */
export function BankLastChance() {
  const { user } = useAuth();
  const { catalog } = usePokemonCatalog();
  const [entries, setEntries] = useState<LastChanceEntry[]>([]);
  const [ticks, setTicks] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, mine] = await Promise.all([
      getLastChanceList(),
      user ? getMyLastChanceTicks() : Promise.resolve({ data: new Set<number>(), error: null }),
    ]);
    setEntries(list.data);
    setTicks(mine.data);
    setError(list.error ?? mine.error);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(
    () => LAST_CHANCE_CATEGORIES
      .map((category) => ({ ...category, entries: entries.filter((entry) => entry.category === category.id) }))
      .filter((group) => group.entries.length > 0),
    [entries],
  );

  const published = entries.filter((entry) => entry.isPublished);
  const sorted = published.filter((entry) => ticks.has(entry.id)).length;

  async function toggle(entry: LastChanceEntry) {
    if (!user) return;
    const done = !ticks.has(entry.id);
    setTicks((current) => {
      const nextTicks = new Set(current);
      if (done) nextTicks.add(entry.id);
      else nextTicks.delete(entry.id);
      return nextTicks;
    });
    const result = await setLastChanceTick(user.id, entry.id, done);
    if (result.error) {
      setError(result.error);
      await load();
    }
  }

  function pokemonFor(entry: LastChanceEntry) {
    if (!catalog) return undefined;
    if (entry.formId != null) return catalog.byFormId.get(entry.formId);
    if (entry.speciesId != null) return catalog.entries.find((row) => row.speciesId === entry.speciesId && row.isDefault);
    return undefined;
  }

  return (
    <section className="bank-section" id="last-chance" aria-labelledby="last-chance-title">
      <div className="bank-section__head">
        <div>
          <h2 id="last-chance-title">Last chance</h2>
          <p className="muted">Things that can only reach HOME through Bank. After the deadline, these are gone for anyone who doesn't already have them.</p>
        </div>
        {user && published.length > 0 && (
          <p className="bank-section__count"><strong>{sorted}</strong> of {published.length} sorted</p>
        )}
      </div>

      {error && <p className="form-message form-message--error">{error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="muted">Nothing listed yet.</p>
      ) : grouped.map((group) => (
        <div className="last-chance-group" key={group.id}>
          <h3>{group.label}</h3>
          <ul className="last-chance-list">
            {group.entries.map((entry) => {
              const pokemon = pokemonFor(entry);
              const done = ticks.has(entry.id);
              return (
                <li key={entry.id} className={done ? 'is-done' : undefined}>
                  {user ? (
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={`Sorted: ${entry.title}`}
                      onChange={() => void toggle(entry)}
                    />
                  ) : <span className="last-chance-list__dot" aria-hidden="true" />}
                  <div className="last-chance-list__body">
                    <strong>
                      {entry.title}
                      {!entry.isPublished && <span className="pokemon-tag">Hidden draft</span>}
                    </strong>
                    {entry.description && <p>{entry.description}</p>}
                    {(pokemon || entry.sourceUrl) && (
                      <div className="last-chance-list__links">
                        {pokemon && (
                          <Link to={`/pokemon/${pokemon.speciesSlug}${pokemon.isDefault ? '' : `?form=${encodeURIComponent(pokemon.formSlug)}`}`}>
                            <PokemonSprite nationalDexNumber={pokemon.dexNumber} name={pokemonLabel(pokemon)} spriteUrl={pokemon.spriteUrl} shinySpriteUrl={pokemon.shinySpriteUrl} />
                            {pokemonLabel(pokemon)}
                          </Link>
                        )}
                        {entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="bank-draft-note">
        {user ? 'Tick things off once you\'ve sorted them, or if they don\'t apply to you. ' : <><Link to="/login">Sign in</Link> to tick things off. </>}
        Something missing? <Link to="/forums">Post it in the forums</Link>.
      </p>
    </section>
  );
}
