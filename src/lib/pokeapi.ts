// Small, typed PokéAPI client used by the public Pokémon information pages.
// DeviDex deliberately fetches detail data on demand instead of bulk-importing
// thousands of rarely-viewed records into Supabase during Phase 7A.
import { formatPokemonName } from './pokemonNames';
import { contextLabel } from './gameContext';

export type NamedApiResource = {
  name: string;
  url: string;
};

export type PokemonTypeSlot = {
  slot: number;
  type: NamedApiResource;
};

export type PokemonAbilitySlot = {
  is_hidden: boolean;
  slot: number;
  ability: NamedApiResource | null;
};

export type PokemonStatSlot = {
  base_stat: number;
  effort: number;
  stat: NamedApiResource;
};

export type PokemonMoveVersionDetail = {
  level_learned_at: number;
  move_learn_method: NamedApiResource;
  version_group: NamedApiResource;
};

export type PokemonMoveEntry = {
  move: NamedApiResource;
  version_group_details: PokemonMoveVersionDetail[];
};

export type PokemonDetail = {
  id: number;
  name: string;
  base_experience: number | null;
  height: number;
  weight: number;
  abilities: PokemonAbilitySlot[];
  stats: PokemonStatSlot[];
  types: PokemonTypeSlot[];
  moves: PokemonMoveEntry[];
  past_types?: Array<{ generation: NamedApiResource; types: PokemonTypeSlot[] }>;
  past_abilities?: Array<{ generation: NamedApiResource; abilities: PokemonAbilitySlot[] }>;
  past_stats?: Array<{ generation: NamedApiResource; stats: PokemonStatSlot[] }>;
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
  };
};

export type PokemonSpeciesDetail = {
  id: number;
  name: string;
  base_happiness: number | null;
  capture_rate: number;
  gender_rate: number;
  hatch_counter: number;
  has_gender_differences: boolean;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  color: NamedApiResource;
  egg_groups: NamedApiResource[];
  evolution_chain: { url: string } | null;
  evolves_from_species: NamedApiResource | null;
  generation: NamedApiResource;
  growth_rate: NamedApiResource;
  habitat: NamedApiResource | null;
  shape: NamedApiResource | null;
  flavor_text_entries: Array<{
    flavor_text: string;
    language: NamedApiResource;
    version: NamedApiResource;
  }>;
  genera: Array<{
    genus: string;
    language: NamedApiResource;
  }>;
};

export async function fetchPokeApiJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`PokéAPI returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function humanizeApiName(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The Pokédex entry for the selected game. PokéAPI is missing entries for some
 * games (Scarlet/Violet, for one), so this falls back to the newest English
 * entry from an earlier game and says which game it came from.
 */
export function pokedexEntryForVersion(species: PokemonSpeciesDetail, versionSlug: string, versionOrder: string[]) {
  const english = species.flavor_text_entries.filter((entry) => entry.language.name === 'en');
  const clean = (text: string) => text.replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const exact = english.find((entry) => entry.version.name === versionSlug);
  if (exact) return { text: clean(exact.flavor_text), version: versionSlug, exact: true };
  const selectedIndex = versionOrder.indexOf(versionSlug);
  const earlier = english
    .filter((entry) => {
      const index = versionOrder.indexOf(entry.version.name);
      return index >= 0 && (selectedIndex < 0 || index < selectedIndex);
    })
    .sort((a, b) => versionOrder.indexOf(b.version.name) - versionOrder.indexOf(a.version.name))[0]
    ?? english[english.length - 1];
  return earlier ? { text: clean(earlier.flavor_text), version: earlier.version.name, exact: false } : null;
}

function generationNumber(resource: NamedApiResource) {
  const romanToNumber: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
  const suffix = resource.name.replace(/^generation-/, '');
  return romanToNumber[suffix] ?? Number(resource.url.match(/\/(\d+)\/?$/)?.[1] ?? 0);
}

function historicalRecord<T extends { generation: NamedApiResource }>(records: T[] | undefined, requestedGeneration: number) {
  return [...(records ?? [])]
    .sort((a, b) => generationNumber(a.generation) - generationNumber(b.generation))
    .find((record) => requestedGeneration <= generationNumber(record.generation));
}

export function pokemonTypesForGeneration(pokemon: PokemonDetail, requestedGeneration: number) {
  return historicalRecord(pokemon.past_types, requestedGeneration)?.types ?? pokemon.types;
}

export function pokemonAbilitiesForGeneration(pokemon: PokemonDetail, requestedGeneration: number) {
  if (requestedGeneration < 3) return [];
  const historical = historicalRecord(pokemon.past_abilities, requestedGeneration)?.abilities;
  return (historical ?? pokemon.abilities).filter((row) => row.ability != null);
}

export function pokemonStatsForGeneration(pokemon: PokemonDetail, requestedGeneration: number) {
  return historicalRecord(pokemon.past_stats, requestedGeneration)?.stats ?? pokemon.stats;
}

export function englishGenus(species: PokemonSpeciesDetail) {
  return species.genera.find((entry) => entry.language.name === 'en')?.genus ?? 'Pokémon';
}

export function genderSummary(genderRate: number) {
  if (genderRate < 0) return 'Gender unknown / genderless';
  const female = (genderRate / 8) * 100;
  const male = 100 - female;
  if (female === 0) return '100% male';
  if (male === 0) return '100% female';
  return `${male.toFixed(male % 1 === 0 ? 0 : 1)}% male · ${female.toFixed(female % 1 === 0 ? 0 : 1)}% female`;
}


export type MoveDetail = {
  id: number;
  name: string;
  accuracy: number | null;
  effect_chance: number | null;
  pp: number | null;
  priority: number;
  power: number | null;
  damage_class: NamedApiResource;
  type: NamedApiResource;
  machines: Array<{
    machine: { url: string };
    version_group: NamedApiResource;
  }>;
  effect_entries?: Array<{
    effect: string;
    short_effect: string;
    language: NamedApiResource;
  }>;
};

export type MachineDetail = {
  id: number;
  item: NamedApiResource;
  move: NamedApiResource;
  version_group: NamedApiResource;
};

const versionGroupLabels: Record<string, string> = {
  'red-blue': 'Red / Blue',
  yellow: 'Yellow',
  'gold-silver': 'Gold / Silver',
  crystal: 'Crystal',
  'ruby-sapphire': 'Ruby / Sapphire',
  emerald: 'Emerald',
  'firered-leafgreen': 'FireRed / LeafGreen',
  'diamond-pearl': 'Diamond / Pearl',
  platinum: 'Platinum',
  'heartgold-soulsilver': 'HeartGold / SoulSilver',
  'black-white': 'Black / White',
  'black-2-white-2': 'Black 2 / White 2',
  'x-y': 'X / Y',
  'omega-ruby-alpha-sapphire': 'Omega Ruby / Alpha Sapphire',
  'sun-moon': 'Sun / Moon',
  'ultra-sun-ultra-moon': 'Ultra Sun / Ultra Moon',
  'lets-go-pikachu-lets-go-eevee': "Let's Go Pikachu / Eevee",
  'sword-shield': 'Sword / Shield',
  'the-isle-of-armor': 'The Isle of Armor',
  'the-crown-tundra': 'The Crown Tundra',
  'brilliant-diamond-shining-pearl': 'Brilliant Diamond / Shining Pearl',
  'legends-arceus': 'Legends: Arceus',
  'scarlet-violet': 'Scarlet / Violet',
  'the-teal-mask': 'The Teal Mask',
  'the-indigo-disk': 'The Indigo Disk',
  'legends-za': 'Legends: Z-A',
  'mega-dimension': 'Mega Dimension',
};

export function versionGroupLabel(slug: string) {
  return versionGroupLabels[slug] ?? humanizeApiName(slug);
}

export function moveLearnMethodLabel(slug: string) {
  const labels: Record<string, string> = {
    'level-up': 'Level up',
    machine: 'TM / HM / TR',
    tutor: 'Move Tutor',
    egg: 'Egg Move',
    'light-ball-egg': 'Light Ball Egg Move',
    'form-change': 'Form change',
    'stadium-surfing-pikachu': 'Stadium reward',
    'colosseum-purification': 'Colosseum purification',
    'xd-shadow': 'XD Shadow move',
    'xd-purification': 'XD purification',
    'zygarde-cube': 'Zygarde Cube',
  };
  return labels[slug] ?? humanizeApiName(slug);
}

export function moveLevelLabel(method: string, level: number) {
  if (method !== 'level-up') return moveLearnMethodLabel(method);
  return level > 0 ? `Lv. ${level}` : 'Evolve';
}

export function formatMachineItemName(slug: string) {
  const match = slug.match(/^(tm|hm|tr)(\d+)$/i);
  if (match) return `${match[1].toUpperCase()}${match[2].padStart(2, '0')}`;
  return humanizeApiName(slug);
}

const moveDetailCache = new Map<string, Promise<MoveDetail>>();
const machineDetailCache = new Map<string, Promise<MachineDetail>>();

export function fetchMoveDetail(moveSlug: string, signal?: AbortSignal) {
  // Do not cache aborted requests: an AbortSignal belongs to one component lifecycle.
  if (signal) {
    return fetchPokeApiJson<MoveDetail>(`https://pokeapi.co/api/v2/move/${encodeURIComponent(moveSlug)}/`, signal);
  }
  let pending = moveDetailCache.get(moveSlug);
  if (!pending) {
    pending = fetchPokeApiJson<MoveDetail>(`https://pokeapi.co/api/v2/move/${encodeURIComponent(moveSlug)}/`);
    moveDetailCache.set(moveSlug, pending);
    pending.catch(() => moveDetailCache.delete(moveSlug));
  }
  return pending;
}

export function fetchMachineDetail(url: string, signal?: AbortSignal) {
  if (signal) return fetchPokeApiJson<MachineDetail>(url, signal);
  let pending = machineDetailCache.get(url);
  if (!pending) {
    pending = fetchPokeApiJson<MachineDetail>(url);
    machineDetailCache.set(url, pending);
    pending.catch(() => machineDetailCache.delete(url));
  }
  return pending;
}

export function latestEnglishMoveEffect(move: MoveDetail) {
  const entry = move.effect_entries?.find((row) => row.language.name === 'en');
  return (entry?.short_effect ?? '')
    .replace(/\$effect_chance%/g, move.effect_chance != null ? `${move.effect_chance}%` : 'its listed chance')
    .replace(/\s+/g, ' ')
    .trim();
}

// Evolution-chain fields have grown over the years as the games invented more
// elaborate requirements. Most are optional because older PokéAPI deployments
// expose only the classic subset, while current data includes newer mechanics.
export type EvolutionDetail = {
  item: NamedApiResource | null;
  trigger: NamedApiResource;
  gender: number | null;
  held_item: NamedApiResource | null;
  known_move: NamedApiResource | null;
  known_move_type: NamedApiResource | null;
  location: NamedApiResource | null;
  min_level: number | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  relative_physical_stats: number | null;
  party_species: NamedApiResource | null;
  party_type: NamedApiResource | null;
  trade_species: NamedApiResource | null;
  needs_overworld_rain: boolean;
  time_of_day: string;
  turn_upside_down: boolean;
  version_group?: NamedApiResource | null;
  is_default?: boolean;
  needs_multiplayer?: boolean;
  near_special_rock?: boolean;
  region?: NamedApiResource | null;
  /** Older PokéAPI field names. */
  base_form?: NamedApiResource | null;
  evolved_form?: NamedApiResource | null;
  required_pokemon_form?: NamedApiResource | null;
  evolved_pokemon_form?: NamedApiResource | null;
  allowed_natures?: NamedApiResource[] | null;
  condition_expression?: { expression: string; percentage_chance: number | null } | null;
  used_move?: NamedApiResource | null;
  min_move_count?: number | null;
  min_steps?: number | null;
  min_damage_taken?: number | null;
};

export type EvolutionChainLink = {
  is_baby: boolean;
  species: NamedApiResource;
  evolution_details: EvolutionDetail[] | null;
  evolves_to: EvolutionChainLink[];
};

export type EvolutionChainDetail = {
  id: number;
  baby_trigger_item: NamedApiResource | null;
  chain: EvolutionChainLink;
};

export type EvolutionRequirementGroup = {
  summary: string;
  versions: string[];
};

/**
 * Release order of PokéAPI version groups (its own `order` column) plus the
 * generation each belongs to. PokéAPI tags an evolution method with the game
 * that introduced it, so "valid in game X" means "the newest method at or
 * before X".
 */
const VERSION_GROUP_ORDER: Record<string, [order: number, generation: number]> = {
  'red-green-japan': [1, 1], 'blue-japan': [2, 1], 'red-blue': [3, 1], yellow: [4, 1],
  'gold-silver': [5, 2], crystal: [6, 2],
  'ruby-sapphire': [7, 3], emerald: [8, 3], colosseum: [9, 3], xd: [10, 3], 'firered-leafgreen': [11, 3],
  'diamond-pearl': [12, 4], platinum: [13, 4], 'heartgold-soulsilver': [14, 4],
  'black-white': [15, 5], 'black-2-white-2': [16, 5],
  'x-y': [17, 6], 'omega-ruby-alpha-sapphire': [18, 6],
  'sun-moon': [19, 7], 'ultra-sun-ultra-moon': [20, 7], 'lets-go-pikachu-lets-go-eevee': [21, 7],
  'sword-shield': [22, 8], 'the-isle-of-armor': [23, 8], 'the-crown-tundra': [24, 8],
  'brilliant-diamond-shining-pearl': [25, 8], 'legends-arceus': [26, 8],
  'scarlet-violet': [27, 9], 'the-teal-mask': [28, 9], 'the-indigo-disk': [29, 9],
  'legends-za': [30, 9], 'mega-dimension': [31, 9], champions: [32, 9],
};

/** Where each game is set. Regional branches and location methods only work there. */
const VERSION_GROUP_REGION: Record<string, string> = {
  'red-green-japan': 'kanto', 'blue-japan': 'kanto', 'red-blue': 'kanto', yellow: 'kanto',
  'firered-leafgreen': 'kanto', 'lets-go-pikachu-lets-go-eevee': 'kanto',
  'gold-silver': 'johto', crystal: 'johto', 'heartgold-soulsilver': 'johto',
  'ruby-sapphire': 'hoenn', emerald: 'hoenn', 'omega-ruby-alpha-sapphire': 'hoenn',
  colosseum: 'orre', xd: 'orre',
  'diamond-pearl': 'sinnoh', platinum: 'sinnoh', 'brilliant-diamond-shining-pearl': 'sinnoh',
  'black-white': 'unova', 'black-2-white-2': 'unova',
  'x-y': 'kalos', 'legends-za': 'kalos', 'mega-dimension': 'kalos',
  'sun-moon': 'alola', 'ultra-sun-ultra-moon': 'alola',
  'sword-shield': 'galar', 'the-isle-of-armor': 'galar', 'the-crown-tundra': 'galar',
  'legends-arceus': 'hisui',
  'scarlet-violet': 'paldea', 'the-teal-mask': 'kitakami', 'the-indigo-disk': 'unova',
};

const REGIONAL_ADJECTIVE: Record<string, string> = {
  alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean',
};

function versionRank(detail: EvolutionDetail) {
  const name = detail.version_group?.name;
  if (!name) return 0;
  return VERSION_GROUP_ORDER[name]?.[0] ?? 999;
}

function versionRegion(detail: EvolutionDetail) {
  const name = detail.version_group?.name;
  return name ? VERSION_GROUP_REGION[name] ?? null : null;
}

/** "sandshrew-alola" → "Alolan Sandshrew"; "rockruff-own-tempo" → "Rockruff (Own Tempo)". */
export function evolutionFormLabel(formSlug: string, speciesSlug?: string) {
  if (!speciesSlug || !formSlug.startsWith(`${speciesSlug}-`)) return humanizeApiName(formSlug);
  const species = formatPokemonName(speciesSlug);
  const [first, ...rest] = formSlug.slice(speciesSlug.length + 1).split('-');
  const regional = REGIONAL_ADJECTIVE[first];
  if (regional) return `${regional} ${species}`; // "-galar-standard" etc. is still just Galarian
  return `${species} (${humanizeApiName([first, ...rest].join('-'))})`;
}

function requiredForm(detail: EvolutionDetail) {
  return detail.required_pokemon_form?.name ?? detail.base_form?.name ?? null;
}

function evolvedForm(detail: EvolutionDetail) {
  return detail.evolved_pokemon_form?.name ?? detail.evolved_form?.name ?? null;
}

type FormNames = { fromSpecies?: string; toSpecies?: string };

/** Form text, left out when it's just the plain species ("eevee" → "eevee"). */
function formRequirements(detail: EvolutionDetail, names: FormNames) {
  const parts: string[] = [];
  const from = requiredForm(detail);
  const to = evolvedForm(detail);
  if (from && from !== names.fromSpecies) parts.push(`from ${evolutionFormLabel(from, names.fromSpecies)}`);
  if (to && to !== names.toSpecies) parts.push(`becomes ${evolutionFormLabel(to, names.toSpecies)}`);
  return parts;
}

function genderRequirement(gender: number | null) {
  if (gender === 1) return 'Female';
  if (gender === 2) return 'Male';
  return null;
}

function triggerSummary(detail: EvolutionDetail) {
  const trigger = detail.trigger.name;
  switch (trigger) {
    case 'level-up': return detail.min_level ? `Level up to Lv. ${detail.min_level}` : 'Level up';
    case 'in-battle-level-up': return detail.min_level ? `Reach Lv. ${detail.min_level} in battle` : 'Level up in battle';
    case 'meltan-candies': return 'In Pokémon GO, spend 400 Meltan Candy';
    case 'trade': return detail.trade_species ? `Trade with ${humanizeApiName(detail.trade_species.name)}` : 'Trade';
    case 'use-item': return detail.item ? `Use ${humanizeApiName(detail.item.name)}` : 'Use an evolution item';
    case 'shed': return 'Evolve Nincada with an empty party slot; later games also require a spare Poké Ball';
    case 'spin': return 'Spin, then strike the evolution pose';
    case 'tower-of-darkness': return 'Complete the Tower of Darkness';
    case 'tower-of-waters': return 'Complete the Tower of Waters';
    case 'three-critical-hits': return 'Land 3 critical hits in one battle';
    case 'take-damage': return detail.min_damage_taken
      ? `Take at least ${detail.min_damage_taken} damage without fainting, then meet the location condition`
      : 'Take damage without fainting, then meet the location condition';
    case 'agile-style-move': return detail.used_move
      ? `Use ${humanizeApiName(detail.used_move.name)} in Agile Style${detail.min_move_count ? ` ${detail.min_move_count} times` : ''}`
      : `Use an Agile Style move${detail.min_move_count ? ` ${detail.min_move_count} times` : ''}`;
    case 'strong-style-move': return detail.used_move
      ? `Use ${humanizeApiName(detail.used_move.name)} in Strong Style${detail.min_move_count ? ` ${detail.min_move_count} times` : ''}`
      : `Use a Strong Style move${detail.min_move_count ? ` ${detail.min_move_count} times` : ''}`;
    case 'recoil-damage': return detail.min_damage_taken
      ? `Accumulate at least ${detail.min_damage_taken} recoil damage without fainting`
      : 'Accumulate recoil damage without fainting';
    case 'use-move': return detail.used_move
      ? `Use ${humanizeApiName(detail.used_move.name)}${detail.min_move_count ? ` ${detail.min_move_count} times` : ''}, then level up`
      : `Use the required move${detail.min_move_count ? ` ${detail.min_move_count} times` : ''}, then level up`;
    case 'three-defeated-bisharp': return 'Defeat 3 Bisharp leading Pawniard groups, then level up';
    case 'gimmighoul-coins': return 'Collect 999 Gimmighoul Coins, then level up';
    case 'other': return 'Special evolution method';
    default: return humanizeApiName(trigger);
  }
}

const SPECIAL_TARGET_SUMMARY: Record<string, string> = {
  silcoon: `Level up to Lv. 7 · Wurmple's personality value picks Silcoon or Cascoon`,
  cascoon: `Level up to Lv. 7 · Wurmple's personality value picks Silcoon or Cascoon`,
  melmetal: 'In Pokémon GO, spend 400 Meltan Candy',
  alcremie: 'Hold a Sweet and spin your character · the Sweet, time of day and spin pick the flavour',
  toxtricity: 'Level up to Lv. 30 · its Nature decides Amped or Low Key form',
};

function baseRequirements(detail: EvolutionDetail, targetSpeciesSlug?: string, hideRegion = false) {
  const requirements: string[] = [triggerSummary(detail)];
  const gender = genderRequirement(detail.gender);
  const levelInTrigger = ['level-up', 'in-battle-level-up'].includes(detail.trigger.name);

  // For use-item evolutions, the item is already the main trigger text.
  if (detail.item && detail.trigger.name !== 'use-item') requirements.push(`use ${humanizeApiName(detail.item.name)}`);
  if (detail.min_level != null && !levelInTrigger) requirements.push(`at Lv. ${detail.min_level} or higher`);
  if (detail.held_item) requirements.push(`while holding ${humanizeApiName(detail.held_item.name)}`);
  if (gender) requirements.push(`${gender} only`);
  if (detail.known_move) requirements.push(`while knowing ${humanizeApiName(detail.known_move.name)}`);
  if (detail.known_move_type) requirements.push(`while knowing a ${humanizeApiName(detail.known_move_type.name)}-type move`);
  if (detail.min_happiness != null) requirements.push(`friendship ${detail.min_happiness}+`);
  if (detail.min_beauty != null) requirements.push(`Beauty ${detail.min_beauty}+`);
  if (detail.min_affection != null) requirements.push(`Affection ${detail.min_affection}+`);
  if (detail.time_of_day) requirements.push(detail.time_of_day === 'day' ? 'during the day' : `at ${detail.time_of_day}`);
  if (detail.near_special_rock) {
    const rock = targetSpeciesSlug === 'leafeon' ? 'the Moss Rock' : targetSpeciesSlug === 'glaceon' ? 'the Ice Rock' : 'the special rock';
    requirements.push(`near ${rock}${detail.location ? ` in ${humanizeApiName(detail.location.name)}` : ''}`);
  } else if (detail.location) {
    requirements.push(`at ${humanizeApiName(detail.location.name)}`);
  }
  if (detail.needs_overworld_rain) requirements.push('while it is raining in the overworld');
  if (detail.party_species) requirements.push(`with ${humanizeApiName(detail.party_species.name)} in the party`);
  if (detail.party_type) requirements.push(`with a ${humanizeApiName(detail.party_type.name)}-type Pokémon in the party`);
  if (detail.relative_physical_stats === 1) requirements.push('with Attack higher than Defense');
  if (detail.relative_physical_stats === -1) requirements.push('with Attack lower than Defense');
  if (detail.relative_physical_stats === 0) requirements.push('with Attack equal to Defense');
  if (detail.turn_upside_down) requirements.push('while the console is held upside down');
  if (detail.needs_multiplayer) requirements.push('while connected in multiplayer');
  if (detail.region && !hideRegion) requirements.push(`in ${humanizeApiName(detail.region.name)}`);
  if (detail.min_steps != null) requirements.push(`after walking ${detail.min_steps.toLocaleString()} steps with it out`);
  if (detail.allowed_natures?.length) {
    const natures = detail.allowed_natures.map((nature) => humanizeApiName(nature.name));
    requirements.push(natures.length <= 4 ? `with a ${natures.join(', ')} nature` : `with one of ${natures.length} natures`);
  }

  // Some newer evolution triggers encode the move count in the trigger itself.
  const moveCountHandled = ['agile-style-move', 'strong-style-move', 'use-move'].includes(detail.trigger.name);
  if (detail.used_move && !moveCountHandled) requirements.push(`after using ${humanizeApiName(detail.used_move.name)}`);
  if (!moveCountHandled && detail.min_move_count != null) {
    requirements.push(`after using the required move ${detail.min_move_count} times`);
  }
  const damageHandled = ['take-damage', 'recoil-damage'].includes(detail.trigger.name);
  if (!damageHandled && detail.min_damage_taken != null) {
    requirements.push(`after taking at least ${detail.min_damage_taken} damage`);
  }
  const chance = detail.condition_expression?.percentage_chance;
  if (chance != null && chance < 100) requirements.push(`${chance}% chance`);
  return requirements;
}

export type EvolutionContext = {
  /** Version groups that make up the selected game (base game first). */
  versionGroups?: string[];
  /** Species the evolution starts from, so plain forms aren't spelled out. */
  fromSpeciesSlug?: string;
};

/**
 * Which methods actually work in the selected game. PokéAPI tags each method
 * with the game that introduced it, so for each branch we keep the newest
 * method released at or before the selected game. Regional branches (Alolan
 * Raichu, Hisuian Typhlosion) only apply in their region's games and replace
 * the normal method there. Location methods (Magnezone, Leafeon) are tied to
 * that generation's map.
 */
function detailsForGame(details: EvolutionDetail[], versionGroups: string[], fromSpeciesSlug?: string, toSpeciesSlug?: string) {
  // A form named exactly like the species is just the normal Pokémon.
  const fromForm = (detail: EvolutionDetail) => { const form = requiredForm(detail); return form === fromSpeciesSlug ? null : form; };
  const toForm = (detail: EvolutionDetail) => { const form = evolvedForm(detail); return form === toSpeciesSlug ? null : form; };
  const selected = versionGroups
    .map((group) => VERSION_GROUP_ORDER[group])
    .filter(Boolean)
    .sort((a, b) => b[0] - a[0])[0];
  if (!selected) return details;
  const [rank] = selected;
  const regions = new Set(versionGroups.map((group) => VERSION_GROUP_REGION[group]).filter(Boolean));

  let candidates = details.filter((detail) => versionRank(detail) <= rank);
  candidates = candidates.filter((detail) => !detail.region || regions.has(detail.region.name));
  // "Level up at Mt. Coronet" only makes sense on Sinnoh's map.
  candidates = candidates.filter((detail) => !(detail.location || detail.near_special_rock) || regions.has(versionRegion(detail) ?? ''));
  if (candidates.some((detail) => detail.region)) {
    candidates = candidates.filter((detail) => detail.region || fromForm(detail));
  }

  const branches = new Map<string, EvolutionDetail[]>();
  for (const detail of candidates) {
    const key = [detail.region?.name, fromForm(detail), toForm(detail)].join('|');
    const list = branches.get(key) ?? [];
    list.push(detail);
    branches.set(key, list);
  }
  return [...branches.values()].flatMap((list) => {
    const newest = Math.max(...list.map(versionRank));
    return list.filter((detail) => versionRank(detail) === newest);
  });
}

export function groupEvolutionRequirements(
  details: EvolutionDetail[] | null | undefined,
  targetSpeciesSlug?: string,
  context: EvolutionContext = {},
): EvolutionRequirementGroup[] {
  if (!details?.length) return [{ summary: 'No evolution method is listed.', versions: [] }];
  const { versionGroups, fromSpeciesSlug } = context;
  const filtered = versionGroups?.length;
  const source = filtered ? detailsForGame(details, versionGroups, fromSpeciesSlug, targetSpeciesSlug) : details;

  if (!source.length) {
    const earliest = [...details].sort((a, b) => versionRank(a) - versionRank(b))[0];
    const selectedRank = Math.max(...versionGroups!.map((group) => VERSION_GROUP_ORDER[group]?.[0] ?? 0));
    const later = earliest?.version_group?.name && versionRank(earliest) > selectedRank ? earliest.version_group.name : null;
    return [{ summary: later ? `Not in this game · added in ${contextLabel(later)}` : "Can't evolve in this game", versions: [] }];
  }

  // Methods that only differ by which form you start with (Burmy cloaks,
  // Vivillon patterns, Flabébé colours) collapse into one line.
  const byBase = new Map<string, { details: EvolutionDetail[] }>();
  for (const detail of source) {
    const special = targetSpeciesSlug ? SPECIAL_TARGET_SUMMARY[targetSpeciesSlug] : undefined;
    const base = special ?? baseRequirements(detail, targetSpeciesSlug, Boolean(filtered)).join(' · ');
    const entry = byBase.get(base) ?? { details: [] };
    entry.details.push(detail);
    byBase.set(base, entry);
  }

  const grouped = new Map<string, Set<string>>();
  for (const [base, entry] of byBase) {
    const special = targetSpeciesSlug ? SPECIAL_TARGET_SUMMARY[targetSpeciesSlug] : undefined;
    const formTexts = new Set(entry.details.map((detail) => formRequirements(detail, { fromSpecies: fromSpeciesSlug, toSpecies: targetSpeciesSlug }).join(' · ')));
    const summaries = special
      ? [special]
      : formTexts.size >= 3
        ? [`${base} · keeps its form`]
        : [...formTexts].map((forms) => (forms ? `${base} · ${forms}` : base));
    for (const summary of summaries) {
      const versions = grouped.get(summary) ?? new Set<string>();
      if (!filtered) entry.details.forEach((detail) => detail.version_group?.name && versions.add(detail.version_group.name));
      grouped.set(summary, versions);
    }
  }

  const result = [...grouped.entries()].map(([summary, versions]) => ({ summary, versions: [...versions] }));
  if (result.length === 1) result[0].versions = [];
  return result;
}

export function apiResourceId(url: string) {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}
