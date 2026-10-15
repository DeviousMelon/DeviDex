import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import { useNow } from '../hooks/useNow';
import {
  addChecklistItem,
  bankIsOpen,
  getChecklist,
  LOCATION_LABELS,
  removeChecklistItem,
  updateChecklistItem,
  type BankLocation,
  type ChecklistItem,
} from '../lib/bank';
import { PokemonPicker } from './PokemonPicker';
import { PokemonSprite } from './PokemonSprite';

const EMPTY_FORM = { label: '', formId: null as number | null, shiny: false, location: 'bank' as BankLocation, boxNote: '', holdForRibbons: false };

/** "Still in Bank": every Pokémon you haven't moved to HOME yet. */
export function BankChecklist() {
  const { user } = useAuth();
  const { catalog } = usePokemonCatalog();
  const open = bankIsOpen(useNow(60_000));
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getChecklist();
    setItems(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toMove = useMemo(
    () => items
      .filter((item) => !item.movedAt)
      // Held ones first: they're the ones people forget about.
      .sort((a, b) => Number(b.holdForRibbons) - Number(a.holdForRibbons)),
    [items],
  );
  const moved = useMemo(() => items.filter((item) => item.movedAt), [items]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!user || !form.label.trim()) return;
    setSaving(true);
    const result = await addChecklistItem(user.id, form);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setForm({ ...EMPTY_FORM, location: form.location });
    await load();
  }

  async function patch(item: ChecklistItem, changes: Parameters<typeof updateChecklistItem>[1]) {
    setItems((current) => current.map((row) => (row.id === item.id ? {
      ...row,
      holdForRibbons: changes.holdForRibbons ?? row.holdForRibbons,
      movedAt: changes.moved === undefined ? row.movedAt : changes.moved ? new Date().toISOString() : null,
    } : row)));
    const result = await updateChecklistItem(item.id, changes);
    if (result.error) {
      setError(result.error);
      await load();
    }
  }

  function markMoved(item: ChecklistItem) {
    if (item.holdForRibbons && !window.confirm(
      `${item.label} is marked as waiting on ribbons. Once it's in HOME it can never go back for them. Mark it as moved anyway?`,
    )) return;
    void patch(item, { moved: true, holdForRibbons: false });
  }

  async function remove(item: ChecklistItem) {
    setItems((current) => current.filter((row) => row.id !== item.id));
    const result = await removeChecklistItem(item.id);
    if (result.error) {
      setError(result.error);
      await load();
    }
  }

  const picked = form.formId != null ? catalog?.byFormId.get(form.formId) : undefined;

  return (
    <section className="bank-section" id="still-in-bank" aria-labelledby="checklist-title">
      <div className="bank-section__head">
        <div>
          <h2 id="checklist-title">Still in Bank</h2>
          <p className="muted">Everything that hasn't made it to HOME yet. Tick it off once it's across.</p>
        </div>
        {!loading && (
          <p className="bank-section__count">
            <strong>{toMove.length}</strong> to move{moved.length > 0 && <> · {moved.length} done</>}
          </p>
        )}
      </div>

      {error && <p className="form-message form-message--error">{error}</p>}

      {open && (
        <form className="bank-add" onSubmit={(event) => void add(event)}>
          <div className="bank-add__pokemon">
            <button type="button" className="bank-add__pick" onClick={() => setPicking(true)} aria-label={picked ? `Change Pokémon, currently ${pokemonLabel(picked)}` : 'Pick a Pokémon (optional)'}>
              {picked ? (
                <PokemonSprite nationalDexNumber={picked.dexNumber} name={pokemonLabel(picked)} shiny={form.shiny} spriteUrl={picked.spriteUrl} shinySpriteUrl={picked.shinySpriteUrl} />
              ) : <span aria-hidden="true">+</span>}
            </button>
            <label>
              <span>Name or nickname</span>
              <input
                required
                maxLength={60}
                value={form.label}
                placeholder="e.g. Emerald Mudkip, OT Devi"
                onChange={(event) => setForm({ ...form, label: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>Where is it?</span>
            <select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value as BankLocation })}>
              {(Object.keys(LOCATION_LABELS) as BankLocation[]).map((key) => <option key={key} value={key}>{LOCATION_LABELS[key]}</option>)}
            </select>
          </label>
          <label>
            <span>Box (optional)</span>
            <input maxLength={80} value={form.boxNote} placeholder="Box 12, slot 4" onChange={(event) => setForm({ ...form, boxNote: event.target.value })} />
          </label>
          <label className="bank-check">
            <input type="checkbox" checked={form.holdForRibbons} onChange={(event) => setForm({ ...form, holdForRibbons: event.target.checked })} />
            <span>Waiting on ribbons</span>
          </label>
          <button className="button button--primary button--small" type="submit" disabled={saving || !form.label.trim()}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : toMove.length === 0 ? (
        <div className="social-empty">
          <strong>{moved.length ? 'Nothing left to move.' : 'Nothing on your list yet.'}</strong>
          <span>{moved.length ? 'Every Pokémon you listed is safely in HOME.' : 'Add anything still sitting in Bank or an old cartridge, so nothing gets left behind.'}</span>
        </div>
      ) : (
        <ul className="bank-list">
          {toMove.map((item) => {
            const pokemon = item.formId != null ? catalog?.byFormId.get(item.formId) : undefined;
            return (
              <li key={item.id} className={item.holdForRibbons ? 'is-held' : undefined}>
                {pokemon ? (
                  <PokemonSprite nationalDexNumber={pokemon.dexNumber} name={pokemonLabel(pokemon)} shiny={item.shiny} spriteUrl={pokemon.spriteUrl} shinySpriteUrl={pokemon.shinySpriteUrl} />
                ) : <span className="bank-list__blank" aria-hidden="true" />}
                <div className="bank-list__main">
                  <strong>{item.shiny && <span className="bank-shiny" title="Shiny">✦ </span>}{item.label}</strong>
                  <small>{LOCATION_LABELS[item.location]}{item.boxNote && ` · ${item.boxNote}`}</small>
                  {item.holdForRibbons && <span className="bank-warning-tag">Do not transfer yet</span>}
                </div>
                <div className="bank-list__actions">
                  <label className="bank-check bank-check--small">
                    <input type="checkbox" checked={item.holdForRibbons} onChange={(event) => void patch(item, { holdForRibbons: event.target.checked })} />
                    <span>Waiting on ribbons</span>
                  </label>
                  <button className="button button--secondary button--small" type="button" disabled={!open} onClick={() => markMoved(item)}>
                    {open ? 'Moved to HOME' : 'Bank closed'}
                  </button>
                  <button className="text-button text-button--quiet" type="button" onClick={() => void remove(item)}>Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {moved.length > 0 && (
        <details className="bank-moved">
          <summary>Already in HOME ({moved.length})</summary>
          <ul className="bank-list bank-list--moved">
            {moved.map((item) => (
              <li key={item.id}>
                <span className="bank-list__blank bank-list__blank--done" aria-hidden="true">✓</span>
                <div className="bank-list__main">
                  <strong>{item.label}</strong>
                  <small>Moved {new Date(item.movedAt!).toLocaleDateString()}</small>
                </div>
                <div className="bank-list__actions">
                  <button className="text-button text-button--quiet" type="button" onClick={() => void patch(item, { moved: false })}>Undo</button>
                  <button className="text-button text-button--quiet" type="button" onClick={() => void remove(item)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PokemonPicker
        open={picking}
        title="Which Pokémon is it?"
        confirmLabel="Use this one"
        onClose={() => setPicking(false)}
        onPick={(pick) => {
          setPicking(false);
          const entry = catalog?.byFormId.get(pick.formId);
          setForm((current) => ({
            ...current,
            formId: pick.formId,
            shiny: pick.shiny,
            label: current.label.trim() || (entry ? pokemonLabel(entry) : current.label),
          }));
        }}
      />
    </section>
  );
}
