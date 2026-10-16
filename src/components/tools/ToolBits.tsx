import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { pokemonLabel } from '../../hooks/usePokemonCatalog';
import type { DirectoryEntry } from '../../hooks/usePokemonDirectory';
import { GAME_FAMILIES, generationRoman, type GameFamily } from '../../lib/gameContext';
import type { DexCatalogEntry } from '../../types';
import { PokemonPicker } from '../PokemonPicker';
import { PokemonSprite } from '../PokemonSprite';

export function TypeBadge({ slug, name }: { slug: string; name: string }) {
  return <span className={`pokemon-type pokemon-type--${slug}`}>{name}</span>;
}

/** The chosen Pokémon for a tool, with a button to change it. */
export function ToolPokemonSlot({
  entry,
  label,
  onPick,
  children,
}: {
  entry: DexCatalogEntry | null;
  label: string;
  onPick: (formId: number) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tool-slot">
      <button type="button" className="tool-slot__pick" onClick={() => setOpen(true)} aria-label={entry ? `${label}: ${pokemonLabel(entry)}. Change` : `Choose ${label.toLowerCase()}`}>
        {entry ? (
          <PokemonSprite
            nationalDexNumber={entry.dexNumber}
            name={pokemonLabel(entry)}
            spriteUrl={entry.spriteUrl}
            shinySpriteUrl={entry.shinySpriteUrl}
          />
        ) : <span className="tool-slot__empty" aria-hidden="true">+</span>}
      </button>
      <div className="tool-slot__body">
        <span className="tool-slot__label">{label}</span>
        <strong>{entry ? pokemonLabel(entry) : 'Nobody yet'}</strong>
        {children}
        <button type="button" className="text-button tool-slot__change" onClick={() => setOpen(true)}>
          {entry ? 'Change' : 'Choose a Pokémon'}
        </button>
      </div>
      <PokemonPicker
        open={open}
        title={`Choose ${label.toLowerCase()}`}
        allowShiny={false}
        onClose={() => setOpen(false)}
        onPick={({ formId }) => { setOpen(false); onPick(formId); }}
      />
    </div>
  );
}

/** A small sprite + name tile that links to the Pokémon's page. */
export function PokemonTile({ item, children }: { item: DirectoryEntry; children?: ReactNode }) {
  const body = (
    <>
      <PokemonSprite
        nationalDexNumber={item.dexNumber}
        name={item.label}
        spriteUrl={item.entry?.spriteUrl ?? null}
        shinySpriteUrl={item.entry?.shinySpriteUrl ?? null}
      />
      <span className="tool-tile__name">{item.label}</span>
      {children && <span className="tool-tile__meta">{children}</span>}
    </>
  );
  if (!item.speciesSlug) return <div className="tool-tile">{body}</div>;
  const form = item.entry && !item.entry.isDefault ? `?form=${encodeURIComponent(item.entry.formSlug)}` : '';
  return <Link className="tool-tile" to={`/pokemon/${item.speciesSlug}${form}`}>{body}</Link>;
}

/** Loading / error / empty states shared by the tools. */
export function ToolState({ loading, error }: { loading?: boolean; error?: string | null }) {
  if (error) return <p className="form-message form-message--error">{error}</p>;
  if (loading) return <p className="muted">Loading…</p>;
  return null;
}

export function percent(value: number, digits = 1) {
  if (value >= 1) return '100%';
  if (value > 0 && value < 0.001) return '<0.1%';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Pick a game by its base version group (learnsets are stored per version group). */
export function GameSelect({
  value,
  onChange,
  filter,
  allowAny = false,
  id,
}: {
  value: string;
  onChange: (versionGroup: string) => void;
  filter?: (family: GameFamily) => boolean;
  allowAny?: boolean;
  id?: string;
}) {
  const families = GAME_FAMILIES.filter((family) => !filter || filter(family));
  const generations = [...new Set(families.map((family) => family.generation))].sort((a, b) => b - a);
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {allowAny && <option value="">Any game</option>}
      {generations.map((generation) => (
        <optgroup key={generation} label={`Generation ${generationRoman[generation]}`}>
          {families.filter((family) => family.generation === generation).map((family) => (
            <option key={family.id} value={family.contexts[0].versionGroup}>{family.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function ToolCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="tool-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Whole number in range; empty or invalid input falls back to the minimum. */
export function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
