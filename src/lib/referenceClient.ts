// Reads the v2.2 reference tables for the Tools pages and Pokémon pages.
// Small tables are cached for the whole browser session; per-Pokémon and
// per-move lookups are fetched when needed.
import { supabase } from './supabase';
import { buildTypeChart, type ChartType, type EfficacyRow, type PastEfficacyRow, type TypeChart } from './typeChart';
import type { RefMove, RefNature, RefPokemon, RefSpecies, RefVersionGroup, RefEggGroup } from './referenceData';

const PAGE = 1000;

async function readAll<T>(table: string, columns = '*', order = 'id'): Promise<T[]> {
  if (!supabase) throw new Error('DeviDex isn’t connected to its database.');
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** One cached promise per key; a failure clears it so the next call retries. */
const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let promise = cache.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = load();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}

export class ReferenceDataMissing extends Error {
  constructor() {
    super('The reference data hasn’t been imported yet. An admin needs to run the Reference data importer.');
  }
}

export function loadTypeChart(): Promise<TypeChart> {
  return cached('typeChart', async () => {
    const [types, efficacy, past] = await Promise.all([
      readAll<ChartType>('ref_types', 'id, slug, name, generation'),
      readAll<EfficacyRow>('ref_type_efficacy', '*', 'attacking_type_id'),
      readAll<PastEfficacyRow>('ref_type_efficacy_past', '*', 'attacking_type_id'),
    ]);
    if (!types.length || !efficacy.length) throw new ReferenceDataMissing();
    return buildTypeChart(types, efficacy, past);
  });
}

export function loadMoves(): Promise<RefMove[]> {
  return cached('moves', async () => {
    const moves = await readAll<RefMove>('ref_moves');
    if (!moves.length) throw new ReferenceDataMissing();
    return moves.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function loadNatures(): Promise<RefNature[]> {
  return cached('natures', () => readAll<RefNature>('ref_natures'));
}

export function loadVersionGroups(): Promise<RefVersionGroup[]> {
  return cached('versionGroups', () => readAll<RefVersionGroup>('ref_version_groups'));
}

export function loadEggGroups(): Promise<RefEggGroup[]> {
  return cached('eggGroups', () => readAll<RefEggGroup>('ref_egg_groups'));
}

/** Species-level data for every species (catch rates, egg groups). ~1,000 small rows. */
export function loadAllSpeciesData(): Promise<Map<number, RefSpecies>> {
  return cached('species', async () => {
    const rows = await readAll<RefSpecies>('ref_species', '*', 'species_id');
    if (!rows.length) throw new ReferenceDataMissing();
    return new Map(rows.map((row) => [row.species_id, row]));
  });
}

/** Every Pokémon variety's battle data (types, stats). ~1,350 rows. */
export function loadAllPokemon(): Promise<Map<number, RefPokemon>> {
  return cached('pokemon', async () => {
    const rows = await readAll<RefPokemon>('ref_pokemon');
    if (!rows.length) throw new ReferenceDataMissing();
    return new Map(rows.map((row) => [row.id, row]));
  });
}

/** form id → PokéAPI Pokémon id, for every form. */
export function loadFormPokemonIds(): Promise<Map<number, number>> {
  return cached('formPokemon', async () => {
    const rows = await readAll<{ form_id: number; pokemon_id: number }>('ref_form_pokemon', 'form_id, pokemon_id', 'form_id');
    return new Map(rows.map((row) => [row.form_id, row.pokemon_id]));
  });
}

export type FormBattleData = { pokemon: RefPokemon; species: RefSpecies | null };

/** Battle and species data for one DeviDex form. */
export async function loadFormBattleData(formId: number): Promise<FormBattleData> {
  const [formIds, pokemon, species] = await Promise.all([loadFormPokemonIds(), loadAllPokemon(), loadAllSpeciesData()]);
  const pokemonId = formIds.get(formId);
  const row = pokemonId != null ? pokemon.get(pokemonId) : undefined;
  if (!row) throw new Error('No battle data for this form yet. Re-running the Reference data importer should fix it.');
  return { pokemon: row, species: species.get(row.species_id) ?? null };
}

export type LearnsetRow = { pokemon_id: number; move_id: number; learn_method: string; level: number; version_group_ids: number[] };

/** Who learns a move, optionally only in one version group and by one method. */
export async function whoLearns(moveId: number, versionGroupId?: number, method?: string): Promise<LearnsetRow[]> {
  if (!supabase) throw new Error('DeviDex isn’t connected to its database.');
  const rows: LearnsetRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('ref_pokemon_moves')
      .select('pokemon_id, move_id, learn_method, level, version_group_ids')
      .eq('move_id', moveId);
    if (versionGroupId != null) query = query.contains('version_group_ids', [versionGroupId]);
    if (method) query = query.eq('learn_method', method);
    const { data, error } = await query.order('pokemon_id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as LearnsetRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** One Pokémon's learnset in one version group (optionally one method). */
export async function learnsetFor(pokemonId: number, versionGroupId: number, method?: string): Promise<LearnsetRow[]> {
  if (!supabase) throw new Error('DeviDex isn’t connected to its database.');
  let query = supabase
    .from('ref_pokemon_moves')
    .select('pokemon_id, move_id, learn_method, level, version_group_ids')
    .eq('pokemon_id', pokemonId)
    .contains('version_group_ids', [versionGroupId]);
  if (method) query = query.eq('learn_method', method);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as LearnsetRow[];
}

export type PastTyping = { pokemon_id: number; until_generation: number; type1_id: number; type2_id: number | null };

/** Typings that changed (pokemon id → rows, earliest first). */
export function loadPastTypings(): Promise<Map<number, PastTyping[]>> {
  return cached('pastTypings', async () => {
    const rows = await readAll<PastTyping>('ref_pokemon_types_past', '*', 'pokemon_id');
    const map = new Map<number, PastTyping[]>();
    for (const row of rows) map.set(row.pokemon_id, [...(map.get(row.pokemon_id) ?? []), row]);
    for (const list of map.values()) list.sort((a, b) => a.until_generation - b.until_generation);
    return map;
  });
}

/** A Pokémon's type ids in a given generation, honouring old typings. */
export function typeIdsInGeneration(pokemon: RefPokemon, pastTypings: Map<number, PastTyping[]>, generation: number) {
  const old = pastTypings.get(pokemon.id)?.find((row) => row.until_generation >= generation);
  const type1 = old ? old.type1_id : pokemon.type1_id;
  const type2 = old ? old.type2_id : pokemon.type2_id;
  return type2 != null ? [type1, type2] : [type1];
}
