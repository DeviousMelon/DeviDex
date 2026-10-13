import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatPokemonName, generationForDexNumber } from '../lib/pokemonNames';
import type { FormCategory } from '../types';

type DataCounts = {
  species: number;
  forms: number;
  trackableForms: number;
  games: number;
  gameDexEntries: number;
  gameFormAvailability: number;
};

type NamedResource = { name: string; url: string };
type PokeApiListResponse = { results: NamedResource[] };

type VersionGroupDetail = {
  name: string;
  versions: NamedResource[];
  pokedexes: NamedResource[];
};

type PokedexDetail = {
  name: string;
  names: Array<{ name: string; language: NamedResource }>;
  pokemon_entries: Array<{
    entry_number: number;
    pokemon_species: NamedResource;
  }>;
};

type PokemonFormDetail = {
  id: number;
  name: string;
  form_name: string;
  form_order: number;
  is_default: boolean;
  is_battle_only: boolean;
  is_mega: boolean;
  pokemon: NamedResource;
  version_group: NamedResource;
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
  };
  form_names: Array<{ name: string; language: NamedResource }>;
};

type GameRow = { id: number; slug: string; name: string };
type SharedDexSetRow = { id: number; slug: string; name: string; source_pokedex_slugs: string[] };
type SpeciesRow = { id: number; slug: string; name: string; national_dex_number: number };

type CsvRow = Record<string, string>;

type PokemonCsvRow = {
  id: number;
  identifier: string;
  speciesId: number;
  isDefault: boolean;
};

type FormCsvRow = {
  id: number;
  formIdentifier: string;
  pokemonId: number;
  isDefault: boolean;
  isBattleOnly: boolean;
  isMega: boolean;
  formOrder: number;
};

const POKEMON_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv';
const POKEMON_FORMS_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_forms.csv';
const POKEMON_SPECIES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species.csv';
// Which games a form is really in: PokéAPI only has learnsets for Pokémon that
// exist in a game's data, so "has moves in version group X" is the evidence.
// (pokemon_game_indices has no rows at all for form Pokémon, ids 10000+.)
const POKEMON_MOVES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_moves.csv';
const GMAX_VERSION_GROUPS = ['sword-shield', 'the-isle-of-armor', 'the-crown-tundra'];

/** pokemon_id → version group ids with a learnset. Line-scans a ~10 MB CSV without building row objects. */
function learnsetVersionGroups(text: string, wanted: Set<number>) {
  const result = new Map<number, Set<number>>();
  let start = text.indexOf('\n') + 1;
  while (start > 0 && start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const firstComma = text.indexOf(',', start);
    if (firstComma > start && firstComma < end) {
      const pokemonId = Number(text.slice(start, firstComma));
      if (wanted.has(pokemonId)) {
        const secondComma = text.indexOf(',', firstComma + 1);
        const versionGroupId = Number(text.slice(firstComma + 1, secondComma));
        const set = result.get(pokemonId) ?? new Set<number>();
        set.add(versionGroupId);
        result.set(pokemonId, set);
      }
    }
    start = end + 1;
  }
  return result;
}
const VERSIONS_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/versions.csv';
const VERSION_GROUPS_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/version_groups.csv';

const emptyCounts: DataCounts = {
  species: 0,
  forms: 0,
  trackableForms: 0,
  games: 0,
  gameDexEntries: 0,
  gameFormAvailability: 0,
};

const patternSpecies = new Set(['vivillon', 'unown']);
const specialSpecies = new Set(['pikachu', 'pichu', 'floette']);
const specialTokens = [
  'cap', 'cosplay', 'rock-star', 'belle', 'pop-star', 'phd', 'libre',
  'totem', 'starter', 'partner', 'spiky-eared', 'eternal', 'world',
];
const regionalTokens = ['alola', 'galar', 'hisui', 'paldea'];

function dexNumberFromUrl(url: string) {
  const match = url.match(/\/pokemon-species\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function pokemonIdFromUrl(url: string) {
  const match = url.match(/\/pokemon\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PokéAPI returned HTTP ${response.status} for ${url}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read form source data (HTTP ${response.status}).`);
  return response.text();
}

// PokeAPI's source CSVs used here contain simple scalar fields. A deliberately
// tiny parser is enough and avoids adding a whole dependency merely to split
// commas that are not quoted in these files.
function parseSimpleCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');

  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

async function fetchInBatches<T>(
  resources: NamedResource[],
  batchSize: number,
  onBatch?: (done: number, total: number) => void,
) {
  const result: T[] = [];
  for (let start = 0; start < resources.length; start += batchSize) {
    const batch = resources.slice(start, start + batchSize);
    result.push(...await Promise.all(batch.map((item) => fetchJson<T>(item.url))));
    onBatch?.(Math.min(start + batch.length, resources.length), resources.length);
  }
  return result;
}

function classifyForm(
  speciesSlug: string,
  detail: PokemonFormDetail,
  csv: FormCsvRow,
): FormCategory {
  const haystack = `${detail.name} ${detail.form_name} ${csv.formIdentifier}`.toLowerCase();
  const battleOnly = detail.is_battle_only
    || detail.is_mega
    || csv.isBattleOnly
    || csv.isMega
    || haystack.includes('gmax')
    || haystack.includes('eternamax');

  if (battleOnly) return 'battle';
  if (specialSpecies.has(speciesSlug) || specialTokens.some((token) => haystack.includes(token))) return 'special';
  if (regionalTokens.some((token) => haystack.includes(token))) return 'regional';
  if (patternSpecies.has(speciesSlug)) return 'pattern';
  return 'alternate';
}

function cleanFormLabel(species: SpeciesRow, detail: PokemonFormDetail) {
  const english = detail.form_names.find((item) => item.language.name === 'en')?.name?.trim();
  if (english) return english;

  if (detail.form_name) {
    const regionalNames: Record<string, string> = {
      alola: 'Alolan',
      galar: 'Galarian',
      hisui: 'Hisuian',
      paldea: 'Paldean',
    };
    return regionalNames[detail.form_name] ?? formatPokemonName(detail.form_name);
  }

  const withoutSpecies = detail.name.startsWith(`${species.slug}-`)
    ? detail.name.slice(species.slug.length + 1)
    : detail.name;
  return formatPokemonName(withoutSpecies || 'Alternate');
}


// PokéAPI models DLC as version rows of their own, while DeviDex deliberately
// stores DLC progress against the parent save (Sword/Shield, Scarlet/Violet).
// Collapse those identifiers back to the real local game slug.
function localGameSlugForVersionIdentifier(identifier: string) {
  const dlcParents: Record<string, string> = {
    'the-isle-of-armor-sword': 'sword',
    'the-isle-of-armor-shield': 'shield',
    'the-crown-tundra-sword': 'sword',
    'the-crown-tundra-shield': 'shield',
    'the-teal-mask-scarlet': 'scarlet',
    'the-teal-mask-violet': 'violet',
    'the-indigo-disk-scarlet': 'scarlet',
    'the-indigo-disk-violet': 'violet',
    'legends-za': 'legends-z-a',
    'mega-dimension': 'legends-z-a',
  };
  return dlcParents[identifier] ?? identifier;
}

export function AdminDataTools() {
  const [counts, setCounts] = useState<DataCounts>(emptyCounts);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [importingNational, setImportingNational] = useState(false);
  const [importingGames, setImportingGames] = useState(false);
  const [importingForms, setImportingForms] = useState(false);
  const [importingGameForms, setImportingGameForms] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const anythingImporting = importingNational || importingGames || importingForms || importingGameForms;

  async function loadCounts() {
    if (!supabase) return;
    setLoadingCounts(true);

    const [species, forms, trackable, games, gameDexEntries, gameFormAvailability] = await Promise.all([
      supabase.from('pokemon_species').select('*', { count: 'exact', head: true }),
      supabase.from('pokemon_forms').select('*', { count: 'exact', head: true }),
      supabase.from('pokemon_forms').select('*', { count: 'exact', head: true }).eq('is_trackable', true),
      supabase.from('games').select('*', { count: 'exact', head: true }),
      supabase.from('game_dex_set_entries').select('*', { count: 'exact', head: true }),
      supabase.from('game_form_availability').select('*', { count: 'exact', head: true }),
    ]);

    setCounts({
      species: species.count ?? 0,
      forms: forms.count ?? 0,
      trackableForms: trackable.count ?? 0,
      games: games.count ?? 0,
      gameDexEntries: gameDexEntries.count ?? 0,
      gameFormAvailability: gameFormAvailability.count ?? 0,
    });
    setLoadingCounts(false);
  }

  useEffect(() => {
    void loadCounts();
  }, []);

  async function importNationalDex() {
    if (!supabase || importingNational) return;

    setImportingNational(true);
    setMessage(null);
    setImportProgress('Fetching the National Dex from PokéAPI…');

    try {
      const payload = await fetchJson<PokeApiListResponse>('https://pokeapi.co/api/v2/pokemon-species?limit=2000');
      const species = payload.results
        .map((item) => {
          const dexNumber = dexNumberFromUrl(item.url);
          if (!dexNumber) return null;

          return {
            id: dexNumber,
            national_dex_number: dexNumber,
            slug: item.name,
            name: formatPokemonName(item.name),
            generation: generationForDexNumber(dexNumber),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => a.id - b.id);

      for (const [index, batch] of chunks(species, 200).entries()) {
        setImportProgress(`Saving species batch ${index + 1} / ${Math.ceil(species.length / 200)}…`);
        const { error } = await supabase.from('pokemon_species').upsert(batch, { onConflict: 'id' });
        if (error) throw error;
      }

      const defaultForms = species.map((item) => ({
        species_id: item.id,
        slug: item.slug,
        name: 'Default',
        is_default: true,
        is_trackable: true,
        form_category: 'default',
        is_battle_only: false,
        supports_placeholder: false,
        form_order: item.id * 1000,
      }));

      for (const [index, batch] of chunks(defaultForms, 200).entries()) {
        setImportProgress(`Saving form batch ${index + 1} / ${Math.ceil(defaultForms.length / 200)}…`);
        const { error } = await supabase.from('pokemon_forms').upsert(batch, { onConflict: 'slug' });
        if (error) throw error;
      }

      setMessage(`Imported ${species.length} National Dex species and default Living Dex entries.`);
      setImportProgress('');
      await loadCounts();
    } catch (error) {
      setMessage(`Import failed: ${error instanceof Error ? error.message : 'Unknown import error.'}`);
      setImportProgress('');
    } finally {
      setImportingNational(false);
    }
  }

  async function importForms() {
    if (!supabase || importingForms) return;

    setImportingForms(true);
    setMessage(null);
    setImportProgress('Reading PokéAPI form source tables…');

    try {
      const [pokemonCsvText, formsCsvText, speciesCsvText, speciesResult] = await Promise.all([
        fetchText(POKEMON_CSV),
        fetchText(POKEMON_FORMS_CSV),
        fetchText(POKEMON_SPECIES_CSV),
        supabase.from('pokemon_species').select('id, slug, name, national_dex_number').order('id'),
      ]);

      if (speciesResult.error) throw speciesResult.error;
      const speciesRows = (speciesResult.data ?? []) as SpeciesRow[];
      const speciesById = new Map(speciesRows.map((species) => [species.id, species]));

      const pokemonRows: PokemonCsvRow[] = parseSimpleCsv(pokemonCsvText).map((row) => ({
        id: Number(row.id),
        identifier: row.identifier,
        speciesId: Number(row.species_id),
        isDefault: row.is_default === '1',
      }));
      const pokemonById = new Map(pokemonRows.map((row) => [row.id, row]));

      const formRows: FormCsvRow[] = parseSimpleCsv(formsCsvText).map((row) => ({
        id: Number(row.id),
        formIdentifier: row.form_identifier,
        pokemonId: Number(row.pokemon_id),
        isDefault: row.is_default === '1',
        isBattleOnly: row.is_battle_only === '1',
        isMega: row.is_mega === '1',
        formOrder: Number(row.form_order || 0),
      }));

      // A species' base slot is the one form whose Pokémon variety AND form are
      // both defaults. Everything else is an optional DeviDex form. This is
      // the important distinction that keeps regional/stat-changing varieties
      // alongside purely cosmetic Pokémon Forms.
      const candidates = formRows.filter((form) => {
        const pokemon = pokemonById.get(form.pokemonId);
        return Boolean(
          pokemon
          && speciesById.has(pokemon.speciesId)
          && !(pokemon.isDefault && form.isDefault && !form.formIdentifier),
        );
      });

      const resources = candidates.map((form) => ({
        name: String(form.id),
        url: `https://pokeapi.co/api/v2/pokemon-form/${form.id}/`,
      }));

      setImportProgress(`Fetching ${resources.length.toLocaleString()} alternate form definitions…`);
      const details = await fetchInBatches<PokemonFormDetail>(
        resources,
        10,
        (done, total) => setImportProgress(`Reading forms ${done.toLocaleString()} / ${total.toLocaleString()}…`),
      );
      const csvById = new Map(candidates.map((form) => [form.id, form]));

      const importedForms = details.flatMap((detail) => {
        const csv = csvById.get(detail.id);
        if (!csv) return [];
        const pokemon = pokemonById.get(csv.pokemonId);
        if (!pokemon) return [];
        const species = speciesById.get(pokemon.speciesId);
        if (!species) return [];

        // Pyroar, Frillish and Jellicent have a real PokéAPI "female" form on
        // the same Pokémon: that is purely cosmetic, so it is a gender slot.
        // Meowstic, Indeedee, Basculegion and Oinkologne females are separate
        // Pokémon with their own moves/stats and stay alternate forms.
        const isCosmeticFemale = csv.formIdentifier === 'female' && pokemon.isDefault;
        const category = isCosmeticFemale ? 'gender' as const : classifyForm(species.slug, detail, csv);
        const battleOnly = category === 'battle';
        const sourcePokemonId = pokemonIdFromUrl(detail.pokemon.url) ?? csv.pokemonId;

        return [{
          species_id: species.id,
          slug: detail.name,
          name: cleanFormLabel(species, detail),
          is_default: false,
          is_trackable: true,
          form_category: category,
          pokeapi_form_id: detail.id,
          source_pokemon_id: sourcePokemonId,
          form_identifier: detail.form_name || csv.formIdentifier || null,
          introduced_version_group: detail.version_group?.name ?? null,
          is_battle_only: battleOnly,
          is_mega: detail.is_mega || csv.isMega,
          supports_placeholder: battleOnly,
          sprite_url: detail.sprites.front_default,
          shiny_sprite_url: detail.sprites.front_shiny,
          form_order: species.national_dex_number * 1000 + Math.max(detail.form_order || csv.formOrder || 1, 1),
          notes: battleOnly
            ? 'Battle-only form. DeviDex tracks this as an optional representation slot.'
            : 'Imported from PokéAPI form data.',
        }];
      });

      // PokeAPI represents visible male/female sprite differences separately in
      // its sprite repository rather than always as Pokémon Form resources.
      // Add one synthetic Female slot for every species flagged as visually
      // gender-different. The normal species slot remains the other appearance.
      // Species that already have a real female form from PokéAPI get no
      // synthetic duplicate: the same slug twice in one upsert batch makes
      // Postgres reject the whole batch, which silently dropped every female
      // slot (Combee and the rest) in earlier imports.
      const speciesWithRealFemale = new Set(
        importedForms.filter((form) => /(^|-)female$/.test(form.slug)).map((form) => form.species_id),
      );

      const genderRows = parseSimpleCsv(speciesCsvText)
        .filter((row) => row.has_gender_differences === '1')
        .flatMap((row) => {
          const speciesId = Number(row.id);
          const species = speciesById.get(speciesId);
          if (!species || speciesWithRealFemale.has(species.id)) return [];

          return [{
            species_id: species.id,
            slug: `${species.slug}-female`,
            name: 'Female',
            is_default: false,
            is_trackable: true,
            form_category: 'gender' as const,
            pokeapi_form_id: null,
            source_pokemon_id: species.id,
            form_identifier: 'female',
            introduced_version_group: 'diamond-pearl',
            is_battle_only: false,
            is_mega: false,
            supports_placeholder: false,
            sprite_url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/female/${species.id}.png`,
            shiny_sprite_url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/female/${species.id}.png`,
            form_order: species.national_dex_number * 1000 + 900,
            notes: 'Synthetic DeviDex slot for a visible female sprite difference.',
          }];
        });

      // Final safety net: one row per slug, first one wins.
      const seenSlugs = new Set<string>();
      const rows = [...importedForms, ...genderRows].filter((row) => {
        if (seenSlugs.has(row.slug)) return false;
        seenSlugs.add(row.slug);
        return true;
      });

      for (const [index, batch] of chunks(rows, 150).entries()) {
        setImportProgress(`Saving form batch ${index + 1} / ${Math.ceil(rows.length / 150)}…`);
        const { error } = await supabase.from('pokemon_forms').upsert(batch, { onConflict: 'slug' });
        if (error) throw error;
      }

      const byCategory = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.form_category] = (acc[row.form_category] ?? 0) + 1;
        return acc;
      }, {});
      const breakdown = Object.entries(byCategory)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, count]) => `${category}: ${count}`)
        .join(' · ');

      setMessage(`Imported ${rows.length.toLocaleString()} optional form slots. ${breakdown}`);
      setImportProgress('');
      await loadCounts();
    } catch (error) {
      setMessage(`Form import failed: ${error instanceof Error ? error.message : 'Unknown import error.'}`);
      setImportProgress('');
    } finally {
      setImportingForms(false);
    }
  }

  async function importGameDexes() {
    if (!supabase || importingGames) return;

    setImportingGames(true);
    setMessage(null);
    setImportProgress('Reading DeviDex shared Game Dex definitions…');

    try {
      const { data: setData, error: setsError } = await supabase
        .from('game_dex_sets')
        .select('id, slug, name, source_pokedex_slugs')
        .eq('is_active', true)
        .order('release_order', { ascending: true });
      if (setsError) throw setsError;

      const sets = (setData ?? []) as SharedDexSetRow[];
      const allDexSlugs = [...new Set(sets.flatMap((set) => set.source_pokedex_slugs ?? []))];
      const resources = allDexSlugs.map((slug) => ({
        name: slug,
        url: `https://pokeapi.co/api/v2/pokedex/${slug}/`,
      }));

      setImportProgress(`Fetching ${resources.length} shared/DLC Pokédex definitions…`);
      const pokedexes = await fetchInBatches<PokedexDetail>(
        resources,
        4,
        (done, total) => setImportProgress(`Reading shared Pokédexes ${done} / ${total}…`),
      );
      const pokedexBySlug = new Map(pokedexes.map((dex) => [dex.name, dex]));

      const rows: Array<{
        set_id: number;
        species_id: number;
        dex_number: number;
        dex_slug: string;
        dex_name: string;
        dex_order: number;
      }> = [];

      for (const set of sets) {
        (set.source_pokedex_slugs ?? []).forEach((dexSlug, dexIndex) => {
          const dex = pokedexBySlug.get(dexSlug);
          if (!dex) return;
          const englishName = dex.names.find((name) => name.language.name === 'en')?.name;
          const dexName = englishName || formatPokemonName(dex.name);

          for (const entry of dex.pokemon_entries) {
            const speciesId = dexNumberFromUrl(entry.pokemon_species.url);
            if (!speciesId) continue;
            rows.push({
              set_id: set.id,
              species_id: speciesId,
              dex_number: entry.entry_number,
              dex_slug: dex.name,
              dex_name: dexName,
              dex_order: dexIndex,
            });
          }
        });
      }

      setImportProgress('Replacing shared Game Dex membership…');
      const { error: deleteError } = await supabase.from('game_dex_set_entries').delete().gt('set_id', 0);
      if (deleteError) throw deleteError;

      for (const [index, batch] of chunks(rows, 300).entries()) {
        setImportProgress(`Saving shared Game Dex batch ${index + 1} / ${Math.ceil(rows.length / 300)}…`);
        const { error } = await supabase
          .from('game_dex_set_entries')
          .upsert(batch, { onConflict: 'set_id,dex_slug,species_id' });
        if (error) throw error;
      }

      setMessage(`Imported ${rows.length.toLocaleString()} shared/DLC Pokédex memberships across ${sets.length} Game Dex sets.`);
      setImportProgress('');
      await loadCounts();
    } catch (error) {
      setMessage(`Shared Game Dex import failed: ${error instanceof Error ? error.message : 'Unknown import error.'}`);
      setImportProgress('');
    } finally {
      setImportingGames(false);
    }
  }


  async function importGameFormAvailability() {
    if (!supabase || importingGameForms) return;

    setImportingGameForms(true);
    setMessage(null);
    setImportProgress('Reading PokéAPI learnsets to see which forms are in which games (about 10 MB)…');

    try {
      const [movesText, versionsText, versionGroupsText, gamesResult] = await Promise.all([
        fetchText(POKEMON_MOVES_CSV),
        fetchText(VERSIONS_CSV),
        fetchText(VERSION_GROUPS_CSV),
        supabase.from('games').select('id, slug, generation').eq('is_active', true),
      ]);
      if (gamesResult.error) throw gamesResult.error;

      const forms: Array<{
        id: number;
        slug: string;
        source_pokemon_id: number | null;
        introduced_version_group: string | null;
        form_category: FormCategory;
      }> = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase
          .from('pokemon_forms')
          .select('id, slug, source_pokemon_id, introduced_version_group, form_category')
          .eq('is_trackable', true)
          .eq('is_default', false)
          .range(from, from + 499);
        if (error) throw error;
        const page = (data ?? []) as typeof forms;
        forms.push(...page);
        if (page.length < 500) break;
      }

      if (forms.length === 0) throw new Error('Import Forms before syncing Game Form Availability.');
      if (forms.some((form) => !form.introduced_version_group)) {
        throw new Error('Re-sync Forms once after installing v1.2 so DeviDex knows when each form was introduced.');
      }

      const games = (gamesResult.data ?? []) as Array<{ id: number; slug: string; generation: number }>;
      const gameBySlug = new Map(games.map((game) => [game.slug, game]));

      const versionGroupRows = parseSimpleCsv(versionGroupsText);
      const versionGroupIdByIdentifier = new Map(versionGroupRows.map((row) => [row.identifier, Number(row.id)]));
      const generationByVersionGroupId = new Map(versionGroupRows.map((row) => [Number(row.id), Number(row.generation_id)]));

      // version group → the local games (Sword, Shield…) that belong to it.
      const gameIdsByVersionGroupId = new Map<number, Set<number>>();
      for (const row of parseSimpleCsv(versionsText)) {
        const game = gameBySlug.get(localGameSlugForVersionIdentifier(row.identifier));
        if (!game) continue;
        const versionGroupId = Number(row.version_group_id);
        const set = gameIdsByVersionGroupId.get(versionGroupId) ?? new Set<number>();
        set.add(game.id);
        gameIdsByVersionGroupId.set(versionGroupId, set);
      }

      setImportProgress('Matching forms to games…');
      const wantedPokemonIds = new Set(forms.flatMap((form) => form.source_pokemon_id == null ? [] : [form.source_pokemon_id]));
      const learnsets = learnsetVersionGroups(movesText, wantedPokemonIds);

      const unique = new Set<string>();
      const rows: Array<{ game_id: number; form_id: number; source: string; notes: string }> = [];
      let fallbackForms = 0;

      for (const form of forms) {
        if (form.source_pokemon_id == null) continue;
        const introducedId = versionGroupIdByIdentifier.get(form.introduced_version_group ?? '');
        const introducedGeneration = generationByVersionGroupId.get(introducedId ?? -1) ?? 1;

        let versionGroupIds = [...(learnsets.get(form.source_pokemon_id) ?? [])];
        let source = 'pokeapi-learnset';
        if (!versionGroupIds.length) {
          // No learnset (G-Max, brand-new Megas): fall back to where it debuted.
          fallbackForms += 1;
          source = 'pokeapi-introduced';
          versionGroupIds = /-gmax$/.test(form.slug)
            ? GMAX_VERSION_GROUPS.flatMap((name) => versionGroupIdByIdentifier.get(name) ?? [])
            : introducedId != null ? [introducedId] : [];
        }

        for (const versionGroupId of versionGroupIds) {
          // Female forms and cosmetic forms share the base Pokémon's learnset,
          // so they also need "not before the form existed".
          if ((generationByVersionGroupId.get(versionGroupId) ?? 99) < introducedGeneration) continue;
          for (const gameId of gameIdsByVersionGroupId.get(versionGroupId) ?? []) {
            const key = `${gameId}:${form.id}`;
            if (unique.has(key)) continue;
            unique.add(key);
            rows.push({
              game_id: gameId,
              form_id: form.id,
              source,
              notes: `Form introduced in ${form.introduced_version_group}.`,
            });
          }
        }
      }
      if (fallbackForms) console.info(`${fallbackForms} forms had no learnset; used their debut game instead.`);

      setImportProgress('Replacing Game Form Availability reference rows…');
      const { error: deleteError } = await supabase.from('game_form_availability').delete().gt('form_id', 0);
      if (deleteError) throw deleteError;

      for (const [index, batch] of chunks(rows, 300).entries()) {
        setImportProgress(`Saving game/form availability ${index + 1} / ${Math.ceil(rows.length / 300)}…`);
        const { error } = await supabase.from('game_form_availability').upsert(batch, { onConflict: 'game_id,form_id' });
        if (error) throw error;
      }

      setMessage(`Synced ${rows.length.toLocaleString()} game/form compatibility pairs across ${games.length} games. Regional, female and other forms now show up in the Game Dexes they belong to.`);
      setImportProgress('');
      await loadCounts();
    } catch (error) {
      setMessage(`Game Form Availability import failed: ${error instanceof Error ? error.message : 'Unknown import error.'}`);
      setImportProgress('');
    } finally {
      setImportingGameForms(false);
    }
  }

  return (
    <section className="section admin-section admin-data-tools">
      <div className="section-heading">
        <div>
          <h2>Pokédex data</h2>
          <p className="muted">Shared data is public-readable, but only an admin can change it.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => void loadCounts()}>
          Refresh counts
        </button>
      </div>

      <div className="admin-data-counts admin-data-counts--six">
        <article><span>Species</span><strong>{loadingCounts ? '…' : counts.species.toLocaleString()}</strong></article>
        <article><span>Forms</span><strong>{loadingCounts ? '…' : counts.forms.toLocaleString()}</strong></article>
        <article><span>Trackable</span><strong>{loadingCounts ? '…' : counts.trackableForms.toLocaleString()}</strong></article>
        <article><span>Games</span><strong>{loadingCounts ? '…' : counts.games.toLocaleString()}</strong></article>
        <article><span>Shared Dex rows</span><strong>{loadingCounts ? '…' : counts.gameDexEntries.toLocaleString()}</strong></article>
        <article><span>Game/Form pairs</span><strong>{loadingCounts ? '…' : counts.gameFormAvailability.toLocaleString()}</strong></article>
      </div>

      <div className="admin-import-card">
        <div>
          <span className="admin-import-card__mark">✓</span>
          <div>
            <h3>National Dex importer</h3>
            <p>Syncs every National Dex species and its default trackable collection slot.</p>
          </div>
        </div>
        <button className="button button--primary" type="button" disabled={anythingImporting} onClick={() => void importNationalDex()}>
          {importingNational ? 'Importing…' : counts.species ? 'Re-sync National Dex' : 'Import National Dex'}
        </button>
      </div>

      <div className="admin-import-card admin-import-card--forms">
        <div>
          <span className="admin-import-card__mark">◇</span>
          <div>
            <h3>Forms importer</h3>
            <p>
              Imports alternate Pokémon varieties, visual forms and visible gender differences.
              Battle-only forms are kept as optional representation slots rather than ordinary stored Pokémon.
            </p>
          </div>
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={anythingImporting || counts.species === 0}
          onClick={() => void importForms()}
        >
          {importingForms ? 'Importing forms…' : counts.species === 0 ? 'Import National Dex first' : counts.forms > counts.species ? 'Re-sync Forms' : 'Import Forms'}
        </button>
      </div>

      <div className="admin-import-card">
        <div>
          <span className="admin-import-card__mark">▦</span>
          <div>
            <h3>Shared Game Dex importer</h3>
            <p>Syncs the shared base and DLC Pokédex definitions seeded by Phase 6A, while keeping ownership progress separate for each real game version.</p>
          </div>
        </div>
        <button className="button button--primary" type="button" disabled={anythingImporting || counts.species === 0} onClick={() => void importGameDexes()}>
          {importingGames ? 'Importing…' : counts.species === 0 ? 'Import National Dex first' : counts.gameDexEntries ? 'Re-sync Shared Dexes' : 'Import Shared Dexes'}
        </button>
      </div>

      <div className="admin-import-card admin-import-card--forms">
        <div>
          <span className="admin-import-card__mark">↔</span>
          <div>
            <h3>Game Form Availability importer</h3>
            <p>Maps optional forms to the real game versions that contain them, using PokéAPI game-index evidence and the form's introduction generation.</p>
          </div>
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={anythingImporting || counts.forms <= counts.species}
          onClick={() => void importGameFormAvailability()}
        >
          {importingGameForms ? 'Syncing game forms…' : counts.forms <= counts.species ? 'Import Forms first' : counts.gameFormAvailability ? 'Re-sync Game Forms' : 'Sync Game Forms'}
        </button>
      </div>

      {importProgress && <p className="admin-import-progress">{importProgress}</p>}
      {message && <p className="admin-import-message">{message}</p>}

      <div className="admin-curation-note">
        <strong>Form classification is deliberately editable.</strong>
        <p>
          The importer gives DeviDex a useful first-pass category from PokéAPI metadata and known form families.
          Future admin curation can move individual forms between categories without changing anyone's saved ticks.
        </p>
      </div>
    </section>
  );
}
