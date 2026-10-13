import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DexCatalogEntry, FormCategory } from '../types';

type RawRow = {
  id: number;
  name: string;
  slug: string;
  is_default: boolean;
  form_category: FormCategory | null;
  is_battle_only: boolean | null;
  supports_placeholder: boolean | null;
  sprite_url: string | null;
  shiny_sprite_url: string | null;
  pokemon_species:
    | { id: number; national_dex_number: number; name: string; slug: string; generation: number }
    | Array<{ id: number; national_dex_number: number; name: string; slug: string; generation: number }>;
};

export interface PokemonCatalog {
  entries: DexCatalogEntry[];
  byFormId: Map<number, DexCatalogEntry>;
}

// The social pages only need the shared catalogue, not anyone's progress, so
// it is loaded once per browser session and shared between every component.
let cached: Promise<PokemonCatalog> | null = null;

async function fetchCatalog(): Promise<PokemonCatalog> {
  if (!supabase) return { entries: [], byFormId: new Map() };

  const PAGE_SIZE = 500;
  const rows: RawRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('pokemon_forms')
      .select(`
        id, name, slug, is_default, form_category, is_battle_only, supports_placeholder,
        sprite_url, shiny_sprite_url,
        pokemon_species!inner ( id, national_dex_number, name, slug, generation )
      `)
      .eq('is_trackable', true)
      .order('form_order', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as RawRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const entries = rows
    .map((row) => {
      const species = Array.isArray(row.pokemon_species) ? row.pokemon_species[0] : row.pokemon_species;
      return {
        formId: row.id,
        formName: row.name,
        formSlug: row.slug,
        isDefault: row.is_default,
        formCategory: row.form_category ?? (row.is_default ? 'default' : 'alternate'),
        isBattleOnly: row.is_battle_only ?? false,
        supportsPlaceholder: row.supports_placeholder ?? false,
        spriteUrl: row.sprite_url,
        shinySpriteUrl: row.shiny_sprite_url,
        speciesId: species.id,
        dexNumber: species.national_dex_number,
        speciesName: species.name,
        speciesSlug: species.slug,
        generation: species.generation,
      } satisfies DexCatalogEntry;
    })
    .sort((a, b) => a.dexNumber - b.dexNumber || Number(b.isDefault) - Number(a.isDefault) || a.formId - b.formId);

  return { entries, byFormId: new Map(entries.map((entry) => [entry.formId, entry])) };
}

export function usePokemonCatalog() {
  const [catalog, setCatalog] = useState<PokemonCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!cached) cached = fetchCatalog();
    cached
      .then((result) => { if (active) setCatalog(result); })
      .catch((caught: unknown) => {
        cached = null; // let the next mount retry
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load Pokémon.');
      });
    return () => { active = false; };
  }, []);

  return { catalog, error, loading: !catalog && !error };
}

/** "Pikachu", or "Vivillon (Polar Pattern)" for alternate forms. */
export function pokemonLabel(entry: DexCatalogEntry) {
  if (entry.isDefault || !entry.formName || entry.formName === entry.speciesName) return entry.speciesName;
  return entry.formName.toLowerCase().includes(entry.speciesName.toLowerCase())
    ? entry.formName
    : `${entry.speciesName} (${entry.formName})`;
}
