import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PokemonPicker } from '../components/PokemonPicker';
import { PokemonSprite } from '../components/PokemonSprite';
import { useAuth } from '../context/AuthContext';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import {
  addToTradeList,
  getMyTradeList,
  removeFromTradeList,
  updateTradeNote,
  type TradeListEntry,
} from '../lib/trades';

/** Your spares. Friends see these as trade matches when they compare with you. */
export function TradeListPage() {
  const { user } = useAuth();
  const { catalog } = usePokemonCatalog();
  const [entries, setEntries] = useState<TradeListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const result = await getMyTradeList();
    setEntries(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add(formId: number, shiny: boolean) {
    if (!user) return;
    setPicking(false);
    const result = await addToTradeList(user.id, formId, shiny);
    if (result.error) setError(result.error);
    await load();
  }

  async function remove(entry: TradeListEntry) {
    if (!user) return;
    setEntries((current) => current.filter((e) => !(e.formId === entry.formId && e.shiny === entry.shiny)));
    const result = await removeFromTradeList(user.id, entry.formId, entry.shiny);
    if (result.error) {
      setError(result.error);
      await load();
    }
  }

  async function saveNote(entry: TradeListEntry, note: string) {
    if (!user || (entry.note ?? '') === note.trim()) return;
    const result = await updateTradeNote(user.id, entry.formId, entry.shiny, note);
    if (result.error) setError(result.error);
    await load();
  }

  return (
    <main className="social-page">
      <section className="social-hero">
        <div>
          <h1>Trade list</h1>
          <p className="muted">
            Spare Pokémon you can give away. When a friend <Link to="/friends">compares collections</Link> with you,
            anything here they're missing shows up as a trade match.
          </p>
        </div>
        <div>
          <button className="button button--primary" type="button" onClick={() => setPicking(true)}>+ Add a spare</button>
        </div>
      </section>

      {error && <p className="form-message form-message--error">{error}</p>}

      <section className="social-section">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="social-empty">
            <strong>Nothing listed yet.</strong>
            <span>Bred too many Eevees? Add them here so friends can find them.</span>
          </div>
        ) : (
          <ul className="trade-list">
            {entries.map((entry) => {
              const pokemon = catalog?.byFormId.get(entry.formId);
              const name = pokemon ? pokemonLabel(pokemon) : 'Loading…';
              return (
                <li key={`${entry.formId}-${entry.shiny}`} className={entry.shiny ? 'is-shiny' : undefined}>
                  {pokemon && (
                    <PokemonSprite
                      nationalDexNumber={pokemon.dexNumber}
                      name={name}
                      shiny={entry.shiny}
                      spriteUrl={pokemon.spriteUrl}
                      shinySpriteUrl={pokemon.shinySpriteUrl}
                    />
                  )}
                  <div>
                    <strong>{entry.shiny && '✦ '}{name}</strong>
                    <input
                      aria-label={`Note for ${name}`}
                      defaultValue={entry.note ?? ''}
                      maxLength={140}
                      placeholder="Private note, e.g. ball, nature, OT"
                      onBlur={(event) => void saveNote(entry, event.target.value)}
                    />
                  </div>
                  <button className="text-button text-button--quiet" type="button" onClick={() => void remove(entry)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PokemonPicker
        open={picking}
        title="Add a spare to your trade list"
        confirmLabel="Add"
        onClose={() => setPicking(false)}
        onPick={(pick) => void add(pick.formId, pick.shiny)}
      />
    </main>
  );
}
