// Reference data (v2.2): turns PokéAPI's source CSVs into rows for the
// ref_* tables. Kept free of React and Supabase so the transform can be
// checked on its own; AdminReferenceData does the fetching and saving.
import { formatPokemonName } from './pokemonNames';

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

/** Every PokéAPI CSV the importer reads, by file name (without .csv). */
export const REFERENCE_CSV_FILES = [
  'types', 'type_names', 'type_efficacy', 'type_efficacy_past',
  'version_groups', 'egg_groups', 'egg_group_prose', 'growth_rates',
  'natures', 'nature_names', 'stats',
  'abilities', 'ability_names',
  'moves', 'move_names', 'move_damage_classes', 'move_targets',
  'items', 'item_names', 'item_categories',
  'pokemon_species', 'pokemon_egg_groups',
  'pokemon', 'pokemon_types', 'pokemon_types_past', 'pokemon_stats', 'pokemon_abilities',
  'pokemon_moves', 'pokemon_move_methods',
] as const;

export type ReferenceCsvName = typeof REFERENCE_CSV_FILES[number];
export type ReferenceCsvTexts = Record<ReferenceCsvName, string>;

export function referenceCsvUrl(name: ReferenceCsvName) {
  return `${CSV_BASE}/${name}.csv`;
}

// ---------------------------------------------------------------
// Row shapes (match supabase/v2.2-reference-data.sql)
// ---------------------------------------------------------------
export type DamageClass = 'physical' | 'special' | 'status';
export type NatureStat = 'attack' | 'defense' | 'special-attack' | 'special-defense' | 'speed';

export type RefType = { id: number; slug: string; name: string; generation: number; legacy_damage_class: 'physical' | 'special' | null };
export type RefTypeEfficacy = { attacking_type_id: number; defending_type_id: number; damage_factor: number };
export type RefTypeEfficacyPast = RefTypeEfficacy & { until_generation: number };
export type RefVersionGroup = { id: number; slug: string; generation: number; sort_order: number };
export type RefEggGroup = { id: number; slug: string; name: string };
export type RefNature = { id: number; slug: string; name: string; increased_stat: NatureStat | null; decreased_stat: NatureStat | null };
export type RefAbility = { id: number; slug: string; name: string; generation: number; is_main_series: boolean };
export type RefMove = {
  id: number; slug: string; name: string; generation: number; type_id: number; damage_class: DamageClass;
  power: number | null; pp: number | null; accuracy: number | null; priority: number; target: string; effect_chance: number | null;
};
export type RefItem = { id: number; slug: string; name: string; category: string; cost: number; fling_power: number | null };
export type RefSpecies = {
  species_id: number; capture_rate: number; base_happiness: number | null; gender_rate: number; hatch_counter: number | null;
  growth_rate: string; egg_group_ids: number[]; evolves_from_species_id: number | null;
  is_baby: boolean; has_gender_differences: boolean; forms_switchable: boolean;
};
export type RefPokemon = {
  id: number; species_id: number; slug: string; is_default: boolean; type1_id: number; type2_id: number | null;
  hp: number; attack: number; defense: number; special_attack: number; special_defense: number; speed: number;
  ability1_id: number | null; ability2_id: number | null; hidden_ability_id: number | null;
  height: number | null; weight: number | null; base_experience: number | null;
};
export type RefPokemonTypesPast = { pokemon_id: number; until_generation: number; type1_id: number; type2_id: number | null };
export type RefPokemonMove = { pokemon_id: number; move_id: number; learn_method: string; level: number; version_group_ids: number[] };

export type ReferenceRows = {
  ref_types: RefType[];
  ref_type_efficacy: RefTypeEfficacy[];
  ref_type_efficacy_past: RefTypeEfficacyPast[];
  ref_version_groups: RefVersionGroup[];
  ref_egg_groups: RefEggGroup[];
  ref_natures: RefNature[];
  ref_abilities: RefAbility[];
  ref_moves: RefMove[];
  ref_items: RefItem[];
  ref_species: RefSpecies[];
  ref_pokemon: RefPokemon[];
  ref_pokemon_types_past: RefPokemonTypesPast[];
  ref_pokemon_moves: RefPokemonMove[];
};

/** Save order: every table comes after the tables it references. */
export const REFERENCE_TABLE_ORDER: Array<keyof ReferenceRows> = [
  'ref_types', 'ref_type_efficacy', 'ref_type_efficacy_past', 'ref_version_groups',
  'ref_egg_groups', 'ref_natures', 'ref_abilities', 'ref_moves', 'ref_items',
  'ref_species', 'ref_pokemon', 'ref_pokemon_types_past', 'ref_pokemon_moves',
];

/** Primary-key columns, for upsert onConflict. */
export const REFERENCE_PRIMARY_KEYS: Record<keyof ReferenceRows, string> = {
  ref_types: 'id',
  ref_type_efficacy: 'attacking_type_id,defending_type_id',
  ref_type_efficacy_past: 'attacking_type_id,defending_type_id,until_generation',
  ref_version_groups: 'id',
  ref_egg_groups: 'id',
  ref_natures: 'id',
  ref_abilities: 'id',
  ref_moves: 'id',
  ref_items: 'id',
  ref_species: 'species_id',
  ref_pokemon: 'id',
  ref_pokemon_types_past: 'pokemon_id,until_generation',
  ref_pokemon_moves: 'pokemon_id,move_id,learn_method,level',
};

// ---------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------
type CsvRow = Record<string, string>;

/**
 * Quote-aware CSV parser. The older importers use a plain split(','), which is
 * fine for their files, but a few name files here contain quoted commas.
 */
export function parseCsv(text: string): CsvRow[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field); field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field); field = '';
      if (record.length > 1 || record[0] !== '') records.push(record);
      record = [];
    } else {
      field += char;
    }
  }
  record.push(field);
  if (record.length > 1 || record[0] !== '') records.push(record);

  const [headers, ...rows] = records;
  if (!headers) return [];
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

const ENGLISH = '9';
const num = (value: string) => Number(value);
const numOrNull = (value: string) => (value === '' ? null : Number(value));
const flag = (value: string) => value === '1';

/** id → English name from a PokéAPI *_names / *_prose file. */
function englishNames(text: string, idColumn: string) {
  const names = new Map<number, string>();
  for (const row of parseCsv(text)) {
    if (row.local_language_id === ENGLISH && row.name) names.set(num(row[idColumn]), row.name);
  }
  return names;
}

function slugLookup(text: string) {
  return new Map(parseCsv(text).map((row) => [num(row.id), row.identifier]));
}

/**
 * Learnsets without building 640k row objects: one pass over the text,
 * folding rows that only differ by version group into one.
 */
function foldLearnsets(
  text: string,
  methodSlugs: Map<number, string>,
  pokemonIds: Set<number>,
  moveIds: Set<number>,
): RefPokemonMove[] {
  const folded = new Map<string, RefPokemonMove>();
  let start = text.indexOf('\n') + 1;

  while (start > 0 && start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    // pokemon_id,version_group_id,move_id,pokemon_move_method_id,level,order,mastery
    const cells = text.slice(start, end).replace(/\r$/, '').split(',');
    start = end + 1;
    if (cells.length < 5) continue;

    const pokemonId = num(cells[0]);
    const versionGroupId = num(cells[1]);
    const moveId = num(cells[2]);
    const method = methodSlugs.get(num(cells[3]));
    if (!method || !pokemonIds.has(pokemonId) || !moveIds.has(moveId)) continue;
    const level = method === 'level-up' ? num(cells[4] || '0') : 0;

    const key = `${pokemonId}:${moveId}:${method}:${level}`;
    const existing = folded.get(key);
    if (existing) {
      if (!existing.version_group_ids.includes(versionGroupId)) existing.version_group_ids.push(versionGroupId);
    } else {
      folded.set(key, { pokemon_id: pokemonId, move_id: moveId, learn_method: method, level, version_group_ids: [versionGroupId] });
    }
  }

  const rows = [...folded.values()];
  for (const row of rows) row.version_group_ids.sort((a, b) => a - b);
  return rows;
}

// ---------------------------------------------------------------
// The transform
// ---------------------------------------------------------------
/**
 * Builds every ref_* row from the CSV texts. Only species already in
 * pokemon_species are included, so a newer PokéAPI can't break foreign keys
 * before the National Dex importer has been re-run.
 */
export function buildReferenceRows(csv: ReferenceCsvTexts, knownSpeciesIds: Set<number>): ReferenceRows {
  // Types: real types only (unknown/shadow are 10000+).
  const typeNames = englishNames(csv.type_names, 'type_id');
  const damageClassSlugs = slugLookup(csv.move_damage_classes);
  const ref_types: RefType[] = parseCsv(csv.types)
    .filter((row) => num(row.id) < 10000)
    .map((row) => {
      const legacy = damageClassSlugs.get(num(row.damage_class_id)) ?? null;
      return {
        id: num(row.id),
        slug: row.identifier,
        name: typeNames.get(num(row.id)) ?? formatPokemonName(row.identifier),
        generation: num(row.generation_id),
        legacy_damage_class: legacy === 'physical' || legacy === 'special' ? legacy : null,
      };
    });
  const typeIds = new Set(ref_types.map((type) => type.id));

  const ref_type_efficacy: RefTypeEfficacy[] = parseCsv(csv.type_efficacy)
    .filter((row) => typeIds.has(num(row.damage_type_id)) && typeIds.has(num(row.target_type_id)))
    .map((row) => ({
      attacking_type_id: num(row.damage_type_id),
      defending_type_id: num(row.target_type_id),
      damage_factor: num(row.damage_factor),
    }));

  const ref_type_efficacy_past: RefTypeEfficacyPast[] = parseCsv(csv.type_efficacy_past)
    .filter((row) => typeIds.has(num(row.damage_type_id)) && typeIds.has(num(row.target_type_id)))
    .map((row) => ({
      attacking_type_id: num(row.damage_type_id),
      defending_type_id: num(row.target_type_id),
      damage_factor: num(row.damage_factor),
      until_generation: num(row.generation_id),
    }));

  const ref_version_groups: RefVersionGroup[] = parseCsv(csv.version_groups).map((row) => ({
    id: num(row.id),
    slug: row.identifier,
    generation: num(row.generation_id),
    sort_order: num(row.order),
  }));

  const eggGroupNames = englishNames(csv.egg_group_prose, 'egg_group_id');
  const ref_egg_groups: RefEggGroup[] = parseCsv(csv.egg_groups).map((row) => ({
    id: num(row.id),
    slug: row.identifier,
    name: eggGroupNames.get(num(row.id)) ?? formatPokemonName(row.identifier),
  }));

  const statSlugs = slugLookup(csv.stats);
  const natureNames = englishNames(csv.nature_names, 'nature_id');
  const ref_natures: RefNature[] = parseCsv(csv.natures).map((row) => {
    const up = statSlugs.get(num(row.increased_stat_id)) as NatureStat | undefined;
    const down = statSlugs.get(num(row.decreased_stat_id)) as NatureStat | undefined;
    const neutral = !up || !down || up === down;
    return {
      id: num(row.id),
      slug: row.identifier,
      name: natureNames.get(num(row.id)) ?? formatPokemonName(row.identifier),
      increased_stat: neutral ? null : up,
      decreased_stat: neutral ? null : down,
    };
  });

  const abilityNames = englishNames(csv.ability_names, 'ability_id');
  const ref_abilities: RefAbility[] = parseCsv(csv.abilities)
    .filter((row) => num(row.id) < 10000)
    .map((row) => ({
      id: num(row.id),
      slug: row.identifier,
      name: abilityNames.get(num(row.id)) ?? formatPokemonName(row.identifier),
      generation: num(row.generation_id),
      is_main_series: flag(row.is_main_series),
    }));
  const abilityIds = new Set(ref_abilities.map((ability) => ability.id));

  const moveNames = englishNames(csv.move_names, 'move_id');
  const targetSlugs = slugLookup(csv.move_targets);
  const ref_moves: RefMove[] = parseCsv(csv.moves)
    .filter((row) => num(row.id) < 10000 && typeIds.has(num(row.type_id)))
    .flatMap((row) => {
      const damageClass = damageClassSlugs.get(num(row.damage_class_id));
      if (damageClass !== 'physical' && damageClass !== 'special' && damageClass !== 'status') return [];
      return [{
        id: num(row.id),
        slug: row.identifier,
        name: moveNames.get(num(row.id)) ?? formatPokemonName(row.identifier),
        generation: num(row.generation_id),
        type_id: num(row.type_id),
        damage_class: damageClass,
        power: numOrNull(row.power),
        pp: numOrNull(row.pp),
        accuracy: numOrNull(row.accuracy),
        priority: num(row.priority || '0'),
        target: targetSlugs.get(num(row.target_id)) ?? 'selected-pokemon',
        effect_chance: numOrNull(row.effect_chance),
      }];
    });
  const moveIds = new Set(ref_moves.map((move) => move.id));

  const itemNames = englishNames(csv.item_names, 'item_id');
  const itemCategorySlugs = slugLookup(csv.item_categories);
  const ref_items: RefItem[] = parseCsv(csv.items).map((row) => ({
    id: num(row.id),
    slug: row.identifier,
    name: itemNames.get(num(row.id)) ?? formatPokemonName(row.identifier),
    category: itemCategorySlugs.get(num(row.category_id)) ?? 'other',
    cost: num(row.cost || '0'),
    fling_power: numOrNull(row.fling_power),
  }));

  // Species: catch rate, breeding.
  const growthRateSlugs = slugLookup(csv.growth_rates);
  const eggGroupsBySpecies = new Map<number, number[]>();
  for (const row of parseCsv(csv.pokemon_egg_groups)) {
    const list = eggGroupsBySpecies.get(num(row.species_id)) ?? [];
    list.push(num(row.egg_group_id));
    eggGroupsBySpecies.set(num(row.species_id), list);
  }
  const ref_species: RefSpecies[] = parseCsv(csv.pokemon_species)
    .filter((row) => knownSpeciesIds.has(num(row.id)))
    .map((row) => ({
      species_id: num(row.id),
      capture_rate: num(row.capture_rate),
      base_happiness: numOrNull(row.base_happiness),
      gender_rate: num(row.gender_rate),
      hatch_counter: numOrNull(row.hatch_counter),
      growth_rate: growthRateSlugs.get(num(row.growth_rate_id)) ?? 'unknown',
      egg_group_ids: (eggGroupsBySpecies.get(num(row.id)) ?? []).sort((a, b) => a - b),
      evolves_from_species_id: numOrNull(row.evolves_from_species_id),
      is_baby: flag(row.is_baby),
      has_gender_differences: flag(row.has_gender_differences),
      forms_switchable: flag(row.forms_switchable),
    }));

  // Pokémon varieties: types, stats, abilities.
  const typesByPokemon = new Map<number, { type1: number; type2: number | null }>();
  for (const row of parseCsv(csv.pokemon_types)) {
    const id = num(row.pokemon_id);
    const entry = typesByPokemon.get(id) ?? { type1: 0, type2: null };
    if (row.slot === '1') entry.type1 = num(row.type_id); else entry.type2 = num(row.type_id);
    typesByPokemon.set(id, entry);
  }

  const statsByPokemon = new Map<number, Record<string, number>>();
  for (const row of parseCsv(csv.pokemon_stats)) {
    const stat = statSlugs.get(num(row.stat_id));
    if (!stat) continue;
    const stats = statsByPokemon.get(num(row.pokemon_id)) ?? {};
    stats[stat] = num(row.base_stat);
    statsByPokemon.set(num(row.pokemon_id), stats);
  }

  const abilitiesByPokemon = new Map<number, { 1: number | null; 2: number | null; hidden: number | null }>();
  for (const row of parseCsv(csv.pokemon_abilities)) {
    const abilityId = num(row.ability_id);
    if (!abilityIds.has(abilityId)) continue;
    const entry = abilitiesByPokemon.get(num(row.pokemon_id)) ?? { 1: null, 2: null, hidden: null };
    if (flag(row.is_hidden)) entry.hidden = abilityId;
    else if (row.slot === '1') entry[1] = abilityId;
    else entry[2] = abilityId;
    abilitiesByPokemon.set(num(row.pokemon_id), entry);
  }

  const ref_pokemon: RefPokemon[] = parseCsv(csv.pokemon)
    .filter((row) => knownSpeciesIds.has(num(row.species_id)))
    .flatMap((row) => {
      const id = num(row.id);
      const types = typesByPokemon.get(id);
      const stats = statsByPokemon.get(id);
      if (!types || !typeIds.has(types.type1) || !stats) return [];
      const abilities = abilitiesByPokemon.get(id);
      return [{
        id,
        species_id: num(row.species_id),
        slug: row.identifier,
        is_default: flag(row.is_default),
        type1_id: types.type1,
        type2_id: types.type2 != null && typeIds.has(types.type2) ? types.type2 : null,
        hp: stats.hp ?? 0,
        attack: stats.attack ?? 0,
        defense: stats.defense ?? 0,
        special_attack: stats['special-attack'] ?? 0,
        special_defense: stats['special-defense'] ?? 0,
        speed: stats.speed ?? 0,
        ability1_id: abilities?.[1] ?? null,
        ability2_id: abilities?.[2] ?? null,
        hidden_ability_id: abilities?.hidden ?? null,
        height: numOrNull(row.height),
        weight: numOrNull(row.weight),
        base_experience: numOrNull(row.base_experience),
      }];
    });
  const pokemonIds = new Set(ref_pokemon.map((pokemon) => pokemon.id));

  const pastTypes = new Map<string, RefPokemonTypesPast>();
  for (const row of parseCsv(csv.pokemon_types_past)) {
    const pokemonId = num(row.pokemon_id);
    if (!pokemonIds.has(pokemonId) || !typeIds.has(num(row.type_id))) continue;
    const key = `${pokemonId}:${row.generation_id}`;
    const entry = pastTypes.get(key) ?? { pokemon_id: pokemonId, until_generation: num(row.generation_id), type1_id: 0, type2_id: null };
    if (row.slot === '1') entry.type1_id = num(row.type_id); else entry.type2_id = num(row.type_id);
    pastTypes.set(key, entry);
  }
  const ref_pokemon_types_past = [...pastTypes.values()].filter((row) => row.type1_id > 0);

  const ref_pokemon_moves = foldLearnsets(csv.pokemon_moves, slugLookup(csv.pokemon_move_methods), pokemonIds, moveIds);

  return {
    ref_types, ref_type_efficacy, ref_type_efficacy_past, ref_version_groups,
    ref_egg_groups, ref_natures, ref_abilities, ref_moves, ref_items,
    ref_species, ref_pokemon, ref_pokemon_types_past, ref_pokemon_moves,
  };
}
