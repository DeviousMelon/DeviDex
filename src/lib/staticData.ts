// Shared, read-only data (the Pokémon catalogue and the reference tables) is
// served as static JSON from Cloudflare instead of the database. The files are
// written by scripts/export-static-data.mjs at build time into /data.
//
// Every file is fetched at most once per browser session. A failed fetch is
// forgotten so the next call retries.
import type { FormCategory } from '../types';

const cache = new Map<string, Promise<unknown>>();

export class StaticDataError extends Error {}

function load<T>(path: string): Promise<T> {
  let promise = cache.get(path) as Promise<T> | undefined;
  if (!promise) {
    promise = fetch(`/data/${path}.json`).then(async (response) => {
      if (!response.ok) throw new StaticDataError(`Couldn’t load ${path} (HTTP ${response.status}).`);
      // Cloudflare answers unknown paths with index.html (the single-page app
      // fallback), so a missing file shows up as HTML rather than a 404.
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('text/html')) throw new StaticDataError(`${path} is missing from this build.`);
      return (await response.json()) as T;
    });
    cache.set(path, promise);
    promise.catch(() => cache.delete(path));
  }
  return promise;
}

// ---------------------------------------------------------------------------
// Manifest

export type StaticManifest = {
  format: number;
  exportedAt: string;
  counts: Record<string, number>;
  learnsetPokemonIds: number[];
  learnsetMoveIds: number[];
};

export function loadManifest() {
  return load<StaticManifest>('manifest');
}

// ---------------------------------------------------------------------------
// Catalogue tables (same columns as the old Supabase tables, minus timestamps)

export type SpeciesRow = {
  id: number;
  national_dex_number: number;
  name: string;
  slug: string;
  generation: number;
  [column: string]: unknown;
};

export type FormRow = {
  id: number;
  species_id: number;
  name: string;
  slug: string;
  is_default: boolean;
  is_trackable: boolean;
  form_category: FormCategory | null;
  form_order: number;
  is_battle_only: boolean | null;
  supports_placeholder: boolean | null;
  sprite_url: string | null;
  shiny_sprite_url: string | null;
  [column: string]: unknown;
};

export type GameRow = {
  id: number;
  slug: string;
  name: string;
  generation: number;
  release_order: number;
  is_active: boolean;
  [column: string]: unknown;
};

export type GameDexSetRow = {
  id: number;
  slug: string;
  name: string;
  generation: number;
  release_order: number;
  scope_type: string;
  region_label: string | null;
  parent_set_id: number | null;
  description: string | null;
  [column: string]: unknown;
};

export type SetMemberRow = { set_id: number; game_id: number; member_order: number; short_label: string | null };
export type SetEntryRow = {
  set_id: number;
  species_id: number;
  dex_number: number;
  dex_slug: string;
  dex_name: string;
  dex_order: number;
  [column: string]: unknown;
};
export type AvailabilityRow = { game_id: number; form_id: number; [column: string]: unknown };
export type ExclusiveRow = { set_id: number; species_id: number; game_id: number };

export const loadSpeciesRows = () => load<SpeciesRow[]>('catalog/pokemon_species');
export const loadFormRows = () => load<FormRow[]>('catalog/pokemon_forms');
export const loadGameRows = () => load<GameRow[]>('catalog/games');
export const loadGameDexSetRows = () => load<GameDexSetRow[]>('catalog/game_dex_sets');
export const loadSetMemberRows = () => load<SetMemberRow[]>('catalog/game_dex_set_members');
export const loadSetEntryRows = () => load<SetEntryRow[]>('catalog/game_dex_set_entries');
export const loadAvailabilityRows = () => load<AvailabilityRow[]>('catalog/game_form_availability');
export const loadExclusiveRows = () => load<ExclusiveRow[]>('catalog/game_dex_version_exclusives');

/** Memoised lookups built from the tables above. */
const derived = new Map<string, Promise<unknown>>();
function memo<T>(key: string, build: () => Promise<T>): Promise<T> {
  let promise = derived.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = build();
    derived.set(key, promise);
    promise.catch(() => derived.delete(key));
  }
  return promise;
}

export function speciesById() {
  return memo('speciesById', async () => new Map((await loadSpeciesRows()).map((row) => [row.id, row])));
}

export function formsById() {
  return memo('formsById', async () => new Map((await loadFormRows()).map((row) => [row.id, row])));
}

export function gamesById() {
  return memo('gamesById', async () => new Map((await loadGameRows()).map((row) => [row.id, row])));
}

export function gameDexSetsById() {
  return memo('gameDexSetsById', async () => new Map((await loadGameDexSetRows()).map((row) => [row.id, row])));
}

/**
 * Trackable forms joined to their species, in form_order. This is exactly what
 * the old `pokemon_forms ... pokemon_species!inner(...) where is_trackable`
 * query returned, so callers keep their existing mapping code.
 */
export function trackableFormsWithSpecies() {
  return memo('trackableFormsWithSpecies', async () => {
    const [forms, species] = await Promise.all([loadFormRows(), speciesById()]);
    return forms
      .filter((form) => form.is_trackable)
      .sort((a, b) => a.form_order - b.form_order || a.id - b.id)
      .flatMap((form) => {
        const parent = species.get(form.species_id);
        return parent ? [{ ...form, pokemon_species: parent }] : [];
      });
  });
}

// ---------------------------------------------------------------------------
// Reference tables

export function loadRefTable<T>(table: string): Promise<T[]> {
  return load<T[]>(`ref/${table}`);
}

type CompactLearnset = [number, number, string, number, number[]];
export type LearnsetFileRow = { pokemon_id: number; move_id: number; learn_method: string; level: number; version_group_ids: number[] };

function expand(rows: CompactLearnset[]): LearnsetFileRow[] {
  return rows.map(([pokemon_id, move_id, learn_method, level, version_group_ids]) => ({
    pokemon_id,
    move_id,
    learn_method,
    level,
    version_group_ids,
  }));
}

/** Every learnset row for one move (empty if nothing learns it). */
export async function learnsetRowsForMove(moveId: number): Promise<LearnsetFileRow[]> {
  const manifest = await loadManifest();
  if (!manifest.learnsetMoveIds.includes(moveId)) return [];
  return expand(await load<CompactLearnset[]>(`ref/learnsets/by-move/${moveId}`));
}

/** Every learnset row for one Pokémon (empty if it has none). */
export async function learnsetRowsForPokemon(pokemonId: number): Promise<LearnsetFileRow[]> {
  const manifest = await loadManifest();
  if (!manifest.learnsetPokemonIds.includes(pokemonId)) return [];
  return expand(await load<CompactLearnset[]>(`ref/learnsets/by-pokemon/${pokemonId}`));
}
