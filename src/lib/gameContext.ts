/**
 * Canonical main-series game context used by Pokémon reference pages.
 *
 * PokéAPI stores learnsets/evolution changes by "version group" (for example
 * red-blue or scarlet-violet), while DeviDex Game Dex progress is tied to an
 * exact save version (for example Red or Scarlet). Keeping both values lets the
 * reference page be accurate now for moves and later for version-specific
 * encounters without inventing duplicate datasets for paired games.
 */
export type GenerationNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type GameVersionChoice = {
  slug: string;
  label: string;
};

export type GameContextChoice = {
  versionGroup: string;
  label: string;
  shortLabel: string;
};

export type GameFamily = {
  id: string;
  generation: GenerationNumber;
  label: string;
  versions: GameVersionChoice[];
  contexts: GameContextChoice[];
  breedingSupported: boolean;
};

export type PokemonGameContext = {
  generation: GenerationNumber;
  familyId: string;
  versionGroup: string;
  version: string;
};

export const generationRoman: Record<GenerationNumber, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
};

export const GAME_FAMILIES: GameFamily[] = [
  {
    id: 'red-blue', generation: 1, label: 'Red / Blue', breedingSupported: false,
    versions: [{ slug: 'red', label: 'Red' }, { slug: 'blue', label: 'Blue' }],
    contexts: [{ versionGroup: 'red-blue', label: 'Red / Blue', shortLabel: 'Base game' }],
  },
  {
    id: 'yellow', generation: 1, label: 'Yellow', breedingSupported: false,
    versions: [{ slug: 'yellow', label: 'Yellow' }],
    contexts: [{ versionGroup: 'yellow', label: 'Yellow', shortLabel: 'Base game' }],
  },
  {
    id: 'gold-silver', generation: 2, label: 'Gold / Silver', breedingSupported: true,
    versions: [{ slug: 'gold', label: 'Gold' }, { slug: 'silver', label: 'Silver' }],
    contexts: [{ versionGroup: 'gold-silver', label: 'Gold / Silver', shortLabel: 'Base game' }],
  },
  {
    id: 'crystal', generation: 2, label: 'Crystal', breedingSupported: true,
    versions: [{ slug: 'crystal', label: 'Crystal' }],
    contexts: [{ versionGroup: 'crystal', label: 'Crystal', shortLabel: 'Base game' }],
  },
  {
    id: 'ruby-sapphire', generation: 3, label: 'Ruby / Sapphire', breedingSupported: true,
    versions: [{ slug: 'ruby', label: 'Ruby' }, { slug: 'sapphire', label: 'Sapphire' }],
    contexts: [{ versionGroup: 'ruby-sapphire', label: 'Ruby / Sapphire', shortLabel: 'Base game' }],
  },
  {
    id: 'emerald', generation: 3, label: 'Emerald', breedingSupported: true,
    versions: [{ slug: 'emerald', label: 'Emerald' }],
    contexts: [{ versionGroup: 'emerald', label: 'Emerald', shortLabel: 'Base game' }],
  },
  {
    id: 'firered-leafgreen', generation: 3, label: 'FireRed / LeafGreen', breedingSupported: true,
    versions: [{ slug: 'firered', label: 'FireRed' }, { slug: 'leafgreen', label: 'LeafGreen' }],
    contexts: [{ versionGroup: 'firered-leafgreen', label: 'FireRed / LeafGreen', shortLabel: 'Base game' }],
  },
  {
    id: 'diamond-pearl', generation: 4, label: 'Diamond / Pearl', breedingSupported: true,
    versions: [{ slug: 'diamond', label: 'Diamond' }, { slug: 'pearl', label: 'Pearl' }],
    contexts: [{ versionGroup: 'diamond-pearl', label: 'Diamond / Pearl', shortLabel: 'Base game' }],
  },
  {
    id: 'platinum', generation: 4, label: 'Platinum', breedingSupported: true,
    versions: [{ slug: 'platinum', label: 'Platinum' }],
    contexts: [{ versionGroup: 'platinum', label: 'Platinum', shortLabel: 'Base game' }],
  },
  {
    id: 'heartgold-soulsilver', generation: 4, label: 'HeartGold / SoulSilver', breedingSupported: true,
    versions: [{ slug: 'heartgold', label: 'HeartGold' }, { slug: 'soulsilver', label: 'SoulSilver' }],
    contexts: [{ versionGroup: 'heartgold-soulsilver', label: 'HeartGold / SoulSilver', shortLabel: 'Base game' }],
  },
  {
    id: 'black-white', generation: 5, label: 'Black / White', breedingSupported: true,
    versions: [{ slug: 'black', label: 'Black' }, { slug: 'white', label: 'White' }],
    contexts: [{ versionGroup: 'black-white', label: 'Black / White', shortLabel: 'Base game' }],
  },
  {
    id: 'black-2-white-2', generation: 5, label: 'Black 2 / White 2', breedingSupported: true,
    versions: [{ slug: 'black-2', label: 'Black 2' }, { slug: 'white-2', label: 'White 2' }],
    contexts: [{ versionGroup: 'black-2-white-2', label: 'Black 2 / White 2', shortLabel: 'Base game' }],
  },
  {
    id: 'x-y', generation: 6, label: 'X / Y', breedingSupported: true,
    versions: [{ slug: 'x', label: 'X' }, { slug: 'y', label: 'Y' }],
    contexts: [{ versionGroup: 'x-y', label: 'X / Y', shortLabel: 'Base game' }],
  },
  {
    id: 'omega-ruby-alpha-sapphire', generation: 6, label: 'Omega Ruby / Alpha Sapphire', breedingSupported: true,
    versions: [{ slug: 'omega-ruby', label: 'Omega Ruby' }, { slug: 'alpha-sapphire', label: 'Alpha Sapphire' }],
    contexts: [{ versionGroup: 'omega-ruby-alpha-sapphire', label: 'Omega Ruby / Alpha Sapphire', shortLabel: 'Base game' }],
  },
  {
    id: 'sun-moon', generation: 7, label: 'Sun / Moon', breedingSupported: true,
    versions: [{ slug: 'sun', label: 'Sun' }, { slug: 'moon', label: 'Moon' }],
    contexts: [{ versionGroup: 'sun-moon', label: 'Sun / Moon', shortLabel: 'Base game' }],
  },
  {
    id: 'ultra-sun-ultra-moon', generation: 7, label: 'Ultra Sun / Ultra Moon', breedingSupported: true,
    versions: [{ slug: 'ultra-sun', label: 'Ultra Sun' }, { slug: 'ultra-moon', label: 'Ultra Moon' }],
    contexts: [{ versionGroup: 'ultra-sun-ultra-moon', label: 'Ultra Sun / Ultra Moon', shortLabel: 'Base game' }],
  },
  {
    id: 'lets-go-pikachu-lets-go-eevee', generation: 7, label: "Let's Go Pikachu / Eevee", breedingSupported: false,
    versions: [{ slug: 'lets-go-pikachu', label: "Let's Go, Pikachu!" }, { slug: 'lets-go-eevee', label: "Let's Go, Eevee!" }],
    contexts: [{ versionGroup: 'lets-go-pikachu-lets-go-eevee', label: "Let's Go Pikachu / Eevee", shortLabel: 'Base game' }],
  },
  {
    id: 'sword-shield', generation: 8, label: 'Sword / Shield', breedingSupported: true,
    versions: [{ slug: 'sword', label: 'Sword' }, { slug: 'shield', label: 'Shield' }],
    contexts: [
      { versionGroup: 'sword-shield', label: 'Sword / Shield', shortLabel: 'Base game' },
      { versionGroup: 'the-isle-of-armor', label: 'Sword / Shield · Isle of Armor', shortLabel: 'Isle of Armor' },
      { versionGroup: 'the-crown-tundra', label: 'Sword / Shield · Crown Tundra', shortLabel: 'Crown Tundra' },
    ],
  },
  {
    id: 'brilliant-diamond-shining-pearl', generation: 8, label: 'Brilliant Diamond / Shining Pearl', breedingSupported: true,
    versions: [{ slug: 'brilliant-diamond', label: 'Brilliant Diamond' }, { slug: 'shining-pearl', label: 'Shining Pearl' }],
    contexts: [{ versionGroup: 'brilliant-diamond-shining-pearl', label: 'Brilliant Diamond / Shining Pearl', shortLabel: 'Base game' }],
  },
  {
    id: 'legends-arceus', generation: 8, label: 'Legends: Arceus', breedingSupported: false,
    versions: [{ slug: 'legends-arceus', label: 'Legends: Arceus' }],
    contexts: [{ versionGroup: 'legends-arceus', label: 'Legends: Arceus', shortLabel: 'Base game' }],
  },
  {
    id: 'scarlet-violet', generation: 9, label: 'Scarlet / Violet', breedingSupported: true,
    versions: [{ slug: 'scarlet', label: 'Scarlet' }, { slug: 'violet', label: 'Violet' }],
    contexts: [
      { versionGroup: 'scarlet-violet', label: 'Scarlet / Violet', shortLabel: 'Base game' },
      { versionGroup: 'the-teal-mask', label: 'Scarlet / Violet · The Teal Mask', shortLabel: 'The Teal Mask' },
      { versionGroup: 'the-indigo-disk', label: 'Scarlet / Violet · The Indigo Disk', shortLabel: 'The Indigo Disk' },
    ],
  },
  {
    id: 'legends-za', generation: 9, label: 'Legends: Z-A', breedingSupported: false,
    versions: [{ slug: 'legends-z-a', label: 'Legends: Z-A' }],
    contexts: [
      { versionGroup: 'legends-za', label: 'Legends: Z-A', shortLabel: 'Base game' },
      { versionGroup: 'mega-dimension', label: 'Legends: Z-A · Mega Dimension', shortLabel: 'Mega Dimension' },
    ],
  },
];

export const GENERATIONS: GenerationNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function familiesForGeneration(generation: GenerationNumber) {
  return GAME_FAMILIES.filter((family) => family.generation === generation);
}

export function gameFamilyById(id: string | null | undefined) {
  return GAME_FAMILIES.find((family) => family.id === id) ?? null;
}

export function gameFamilyForVersionGroup(versionGroup: string | null | undefined) {
  if (!versionGroup) return null;
  return GAME_FAMILIES.find((family) => family.contexts.some((context) => context.versionGroup === versionGroup)) ?? null;
}

export function gameFamilyForVersion(version: string | null | undefined) {
  if (!version) return null;
  return GAME_FAMILIES.find((family) => family.versions.some((candidate) => candidate.slug === version)) ?? null;
}

export function contextLabel(versionGroup: string) {
  const family = gameFamilyForVersionGroup(versionGroup);
  return family?.contexts.find((context) => context.versionGroup === versionGroup)?.label ?? versionGroup;
}

/** Every game version in release order (for "newest entry before X" lookups). */
export const VERSION_ORDER: string[] = GAME_FAMILIES.flatMap((family) => family.versions.map((version) => version.slug));

export function versionLabel(version: string) {
  const family = gameFamilyForVersion(version);
  return family?.versions.find((candidate) => candidate.slug === version)?.label ?? version;
}

export function normalizePokemonGameContext(candidate: Partial<PokemonGameContext> | null | undefined): PokemonGameContext {
  const requestedGeneration = Number(candidate?.generation);
  const generation = (GENERATIONS.includes(requestedGeneration as GenerationNumber)
    ? requestedGeneration
    : 9) as GenerationNumber;

  const byGroup = gameFamilyForVersionGroup(candidate?.versionGroup);
  const byFamily = gameFamilyById(candidate?.familyId);
  const byVersion = gameFamilyForVersion(candidate?.version);
  const family = [byGroup, byFamily, byVersion].find((item) => item?.generation === generation)
    ?? familiesForGeneration(generation)[0]
    ?? GAME_FAMILIES[0];

  const requestedGroup = candidate?.versionGroup;
  const context = family.contexts.find((item) => item.versionGroup === requestedGroup) ?? family.contexts[0];
  const requestedVersion = candidate?.version;
  const version = family.versions.find((item) => item.slug === requestedVersion)?.slug ?? family.versions[0].slug;

  return {
    generation: family.generation,
    familyId: family.id,
    versionGroup: context.versionGroup,
    version,
  };
}

const GAME_DEX_CONTEXT_OVERRIDES: Record<string, string> = {
  'isle-of-armor': 'the-isle-of-armor',
  'crown-tundra': 'the-crown-tundra',
  kitakami: 'the-teal-mask',
  blueberry: 'the-indigo-disk',
  'hyperspace-za': 'mega-dimension',
};

/** Resolve a Game Dex card + selected save version into Pokémon-page context. */
export function pokemonInfoContextForGameDex(setSlug: string, generation: number, version: string): PokemonGameContext {
  const family = gameFamilyForVersion(version)
    ?? familiesForGeneration(generation as GenerationNumber)[0]
    ?? GAME_FAMILIES[0];
  const overrideGroup = GAME_DEX_CONTEXT_OVERRIDES[setSlug];
  const versionGroup = family.contexts.some((context) => context.versionGroup === overrideGroup)
    ? overrideGroup
    : family.contexts[0].versionGroup;

  return normalizePokemonGameContext({
    generation: family.generation,
    familyId: family.id,
    versionGroup,
    version,
  });
}

export function gameContextStorageKey() {
  return 'devidex:pokemon-game-context:v1';
}

/** Version groups whose cumulative data applies to the selected context. */
export function inheritedVersionGroupsForContext(versionGroup: string) {
  const inherited: Record<string, string[]> = {
    'the-isle-of-armor': ['sword-shield', 'the-isle-of-armor'],
    'the-crown-tundra': ['sword-shield', 'the-isle-of-armor', 'the-crown-tundra'],
    'the-teal-mask': ['scarlet-violet', 'the-teal-mask'],
    'the-indigo-disk': ['scarlet-violet', 'the-teal-mask', 'the-indigo-disk'],
    'mega-dimension': ['legends-za', 'mega-dimension'],
  };
  return inherited[versionGroup] ?? [versionGroup];
}
