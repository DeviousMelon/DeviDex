// Small, typed PokéAPI client used by the public Pokémon information pages.
// DeviDex deliberately fetches detail data on demand instead of bulk-importing
// thousands of rarely-viewed records into Supabase during Phase 7A.

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

export function latestEnglishFlavorText(species: PokemonSpeciesDetail) {
  const english = species.flavor_text_entries.filter((entry) => entry.language.name === 'en');
  const latest = english.at(-1)?.flavor_text ?? '';
  return latest.replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function englishFlavorTextForVersion(species: PokemonSpeciesDetail, versionSlug: string) {
  const exact = species.flavor_text_entries.find(
    (entry) => entry.language.name === 'en' && entry.version.name === versionSlug,
  )?.flavor_text;
  // A missing entry is more honest than borrowing flavour text from another game
  // while the page is explicitly claiming to show one selected version.
  return (exact ?? '').replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  return level > 0 ? `Lv. ${level}` : 'Start / reminder';
}

export function formatMachineItemName(slug: string) {
  const match = slug.match(/^(tm|hm|tr)(\d+)$/i);
  if (match) return `${match[1].toUpperCase()}${match[2].padStart(2, '0')}`;
  return humanizeApiName(slug);
}


export const versionGroupOrder = [
  'red-blue',
  'yellow',
  'gold-silver',
  'crystal',
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
  'black-white',
  'black-2-white-2',
  'x-y',
  'omega-ruby-alpha-sapphire',
  'sun-moon',
  'ultra-sun-ultra-moon',
  'lets-go-pikachu-lets-go-eevee',
  'sword-shield',
  'the-isle-of-armor',
  'the-crown-tundra',
  'brilliant-diamond-shining-pearl',
  'legends-arceus',
  'scarlet-violet',
  'the-teal-mask',
  'the-indigo-disk',
  'legends-za',
  'mega-dimension',
] as const;

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
  base_form?: NamedApiResource | null;
  evolved_form?: NamedApiResource | null;
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

function genderRequirement(gender: number | null) {
  if (gender === 1) return 'Female';
  if (gender === 2) return 'Male';
  return null;
}

function triggerSummary(detail: EvolutionDetail) {
  const trigger = detail.trigger.name;
  switch (trigger) {
    case 'level-up': return detail.min_level ? `Level up to Lv. ${detail.min_level}` : 'Level up';
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

export function evolutionRequirementSummary(detail: EvolutionDetail, targetSpeciesSlug?: string) {
  const specialTargetSummary: Record<string, string> = {
    silcoon: `Level up to Lv. 7 · Wurmple's personality value determines this branch`,
    cascoon: `Level up to Lv. 7 · Wurmple's personality value determines this branch`,
    melmetal: 'In Pokémon GO, spend 400 Meltan Candy',
  };
  if (targetSpeciesSlug && specialTargetSummary[targetSpeciesSlug]) return specialTargetSummary[targetSpeciesSlug];

  const requirements: string[] = [triggerSummary(detail)];
  const gender = genderRequirement(detail.gender);

  // For use-item evolutions, the item is already the main trigger text.
  if (detail.item && detail.trigger.name !== 'use-item') requirements.push(`use ${humanizeApiName(detail.item.name)}`);
  if (detail.min_level != null && detail.trigger.name !== 'level-up') requirements.push(`at Lv. ${detail.min_level} or higher`);
  if (detail.held_item) requirements.push(`while holding ${humanizeApiName(detail.held_item.name)}`);
  if (gender) requirements.push(`${gender} only`);
  if (detail.known_move) requirements.push(`while knowing ${humanizeApiName(detail.known_move.name)}`);
  if (detail.known_move_type) requirements.push(`while knowing a ${humanizeApiName(detail.known_move_type.name)}-type move`);
  if (detail.min_happiness != null) requirements.push(`friendship at least ${detail.min_happiness}`);
  if (detail.min_beauty != null) requirements.push(`Beauty at least ${detail.min_beauty}`);
  if (detail.min_affection != null) requirements.push(`Affection at least ${detail.min_affection}`);
  if (detail.time_of_day) requirements.push(`during ${humanizeApiName(detail.time_of_day)}`);
  if (detail.location) requirements.push(`at ${humanizeApiName(detail.location.name)}`);
  if (detail.near_special_rock) {
    const rock = targetSpeciesSlug === 'leafeon' ? 'Moss Rock' : targetSpeciesSlug === 'glaceon' ? 'Ice Rock' : 'the required special rock';
    requirements.push(`near ${rock}`);
  }
  if (detail.needs_overworld_rain) requirements.push('while it is raining in the overworld');
  if (detail.party_species) requirements.push(`with ${humanizeApiName(detail.party_species.name)} in the party`);
  if (detail.party_type) requirements.push(`with a ${humanizeApiName(detail.party_type.name)}-type Pokémon in the party`);
  if (detail.relative_physical_stats === 1) requirements.push('with Attack higher than Defense');
  if (detail.relative_physical_stats === -1) requirements.push('with Attack lower than Defense');
  if (detail.relative_physical_stats === 0) requirements.push('with Attack equal to Defense');
  if (detail.turn_upside_down) requirements.push('while the console is held upside down');
  if (detail.needs_multiplayer) requirements.push('while connected in multiplayer');
  if (detail.region) requirements.push(`in ${humanizeApiName(detail.region.name)}`);
  if (detail.min_steps != null) requirements.push(`after walking at least ${detail.min_steps.toLocaleString()} steps together`);

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
  if (detail.base_form) requirements.push(`from ${humanizeApiName(detail.base_form.name)} form`);
  if (detail.evolved_form) requirements.push(`results in ${humanizeApiName(detail.evolved_form.name)} form`);

  return requirements.join(' · ');
}

export function groupEvolutionRequirements(
  details: EvolutionDetail[] | null | undefined,
  targetSpeciesSlug?: string,
  allowedVersionGroups?: string[],
): EvolutionRequirementGroup[] {
  if (!details?.length) return [{ summary: 'No evolution requirement data is listed.', versions: [] }];

  const allowed = allowedVersionGroups?.length ? new Set(allowedVersionGroups) : null;
  const unversioned = details.filter((detail) => !detail.version_group?.name);
  const matching = allowed
    ? details.filter((detail) => detail.version_group?.name && allowed.has(detail.version_group.name))
    : details;
  // Common unversioned rules apply in every game. If PokéAPI has a rule tied
  // to this exact version group, include it too; unrelated historical methods
  // stay out of the current-game view.
  const relevant = allowed ? [...unversioned, ...matching] : details;
  if (allowed && relevant.length === 0) {
    return [{ summary: 'No evolution method is listed for this selected game.', versions: [] }];
  }
  const source = relevant.length ? relevant : details;

  const grouped = new Map<string, Set<string>>();
  for (const detail of source) {
    const summary = evolutionRequirementSummary(detail, targetSpeciesSlug);
    const versions = grouped.get(summary) ?? new Set<string>();
    if (detail.version_group?.name) versions.add(detail.version_group.name);
    grouped.set(summary, versions);
  }

  const result = [...grouped.entries()].map(([summary, versions]) => ({
    summary,
    versions: [...versions],
  }));

  if (result.length === 1) result[0].versions = [];
  return result;
}

export function apiResourceId(url: string) {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}
