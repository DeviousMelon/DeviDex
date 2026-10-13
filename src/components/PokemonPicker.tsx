import { useEffect, useMemo, useRef, useState } from 'react';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import { PokemonSprite } from './PokemonSprite';

type PokemonPickerProps = {
  open: boolean;
  title: string;
  confirmLabel?: string;
  onPick: (pick: { formId: number; shiny: boolean }) => void;
  onClose: () => void;
};

const MAX_RESULTS = 60;

/** Search-and-pick dialog for any trackable Pokémon form, normal or shiny. */
export function PokemonPicker({ open, title, confirmLabel = 'Choose', onPick, onClose }: PokemonPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { catalog, error, loading } = usePokemonCatalog();
  const [query, setQuery] = useState('');
  const [shiny, setShiny] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery('');
      setSelected(null);
      dialog.showModal();
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLowerCase().replace(/^#/, '');
    if (!needle) return catalog.entries.filter((entry) => entry.isDefault).slice(0, MAX_RESULTS);
    const asNumber = Number(needle);
    return catalog.entries
      .filter((entry) =>
        (Number.isInteger(asNumber) && entry.dexNumber === asNumber)
        || pokemonLabel(entry).toLowerCase().includes(needle)
        || entry.formSlug.includes(needle))
      .slice(0, MAX_RESULTS);
  }, [catalog, query]);

  const selectedEntry = selected != null ? catalog?.byFormId.get(selected) : undefined;

  return (
    <dialog ref={dialogRef} className="social-dialog social-dialog--wide" onClose={onClose} aria-labelledby="pokemon-picker-title">
      <div className="social-dialog__body">
        <h2 id="pokemon-picker-title">{title}</h2>
        <div className="picker-controls">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or Dex number"
            aria-label="Search Pokémon"
          />
          <label className="picker-shiny">
            <input type="checkbox" checked={shiny} onChange={(event) => setShiny(event.target.checked)} />
            ✦ Shiny
          </label>
        </div>

        {loading && <p className="muted">Loading Pokémon…</p>}
        {error && <p className="form-message form-message--error">{error}</p>}

        <div className="picker-grid" role="listbox" aria-label="Pokémon">
          {results.map((entry) => (
            <button
              key={entry.formId}
              type="button"
              role="option"
              aria-selected={selected === entry.formId}
              className={selected === entry.formId ? 'is-selected' : undefined}
              onClick={() => setSelected(entry.formId)}
              onDoubleClick={() => onPick({ formId: entry.formId, shiny })}
            >
              <PokemonSprite
                nationalDexNumber={entry.dexNumber}
                name={pokemonLabel(entry)}
                shiny={shiny}
                spriteUrl={entry.spriteUrl}
                shinySpriteUrl={entry.shinySpriteUrl}
              />
              <span>#{entry.dexNumber} {pokemonLabel(entry)}</span>
            </button>
          ))}
          {catalog && results.length === 0 && <p className="muted">No Pokémon match “{query}”.</p>}
        </div>

        <div className="social-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onClose}>Cancel</button>
          <button
            className="button button--primary"
            type="button"
            disabled={!selectedEntry}
            onClick={() => selectedEntry && onPick({ formId: selectedEntry.formId, shiny })}
          >
            {selectedEntry ? `${confirmLabel} ${shiny ? 'shiny ' : ''}${pokemonLabel(selectedEntry)}` : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
