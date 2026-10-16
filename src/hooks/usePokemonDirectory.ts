import { useMemo } from 'react';
import { pokemonLabel, usePokemonCatalog } from './usePokemonCatalog';
import { useReference } from './useReference';
import { loadAllPokemon, loadAllSpeciesData, loadFormPokemonIds } from '../lib/referenceClient';
import { formatPokemonName } from '../lib/pokemonNames';
import type { DexCatalogEntry } from '../types';
import type { RefPokemon, RefSpecies } from '../lib/referenceData';

export type DirectoryEntry = {
  pokemon: RefPokemon;
  species: RefSpecies | null;
  /** The DeviDex form for this Pokémon, when it's a trackable one. */
  entry: DexCatalogEntry | null;
  label: string;
  speciesSlug: string | null;
  dexNumber: number;
};

export type PokemonDirectory = {
  byPokemonId: Map<number, DirectoryEntry>;
  /** form id → the Pokémon id that holds its battle data. */
  pokemonIdForForm: Map<number, number>;
  all: DirectoryEntry[];
};

/**
 * Joins the DeviDex form catalogue with the reference tables, so a learnset or
 * breeding list (keyed by PokéAPI Pokémon id) can show the right name, sprite
 * and link.
 */
export function usePokemonDirectory() {
  const { catalog, error: catalogError } = usePokemonCatalog();
  const reference = useReference(
    () => Promise.all([loadAllPokemon(), loadAllSpeciesData(), loadFormPokemonIds()]),
    [],
  );

  const directory = useMemo<PokemonDirectory | null>(() => {
    if (!catalog || !reference.data) return null;
    const [pokemon, species, formPokemonIds] = reference.data;

    const entryForPokemon = new Map<number, DexCatalogEntry>();
    for (const entry of catalog.entries) {
      const pokemonId = formPokemonIds.get(entry.formId);
      if (pokemonId == null) continue;
      const existing = entryForPokemon.get(pokemonId);
      // Prefer the base slot, then the first form listed.
      if (!existing || (entry.isDefault && !existing.isDefault)) entryForPokemon.set(pokemonId, entry);
    }
    const speciesEntry = new Map<number, DexCatalogEntry>();
    for (const entry of catalog.entries) if (entry.isDefault) speciesEntry.set(entry.speciesId, entry);

    const byPokemonId = new Map<number, DirectoryEntry>();
    for (const row of pokemon.values()) {
      const entry = entryForPokemon.get(row.id) ?? null;
      const base = speciesEntry.get(row.species_id);
      byPokemonId.set(row.id, {
        pokemon: row,
        species: species.get(row.species_id) ?? null,
        entry,
        label: entry ? pokemonLabel(entry) : formatPokemonName(row.slug),
        speciesSlug: base?.speciesSlug ?? null,
        dexNumber: base?.dexNumber ?? row.species_id,
      });
    }
    const all = [...byPokemonId.values()].sort((a, b) => a.dexNumber - b.dexNumber || a.pokemon.id - b.pokemon.id);
    return { byPokemonId, pokemonIdForForm: formPokemonIds, all };
  }, [catalog, reference.data]);

  return {
    directory,
    catalog,
    error: catalogError ?? reference.error,
    loading: !directory && !catalogError && !reference.error,
  };
}
