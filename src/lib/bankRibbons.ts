// Ribbon Master route data for the Pokémon Bank shutdown planner.
//
// DRAFT DATA. Check every ribbon against Bulbapedia before this ships. It
// lives here rather than in the database so fixing a typo or a missing
// ribbon is a code change, not a migration; plans only store ribbon ids.
// Never rename an id once people are using it, or their ticks disappear.

/** The only order a Pokémon can travel. Every hop is one-way. */
export type RibbonStage = 'gen3' | 'gen4' | 'gen5' | 'gen6' | 'gen7' | 'home';

export const STAGE_ORDER: RibbonStage[] = ['gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'home'];

export const STAGE_LABELS: Record<RibbonStage, { short: string; long: string }> = {
  gen3: { short: 'Gen 3', long: 'Gen 3 (GBA and GameCube)' },
  gen4: { short: 'Gen 4', long: 'Gen 4 (DPPt, HGSS)' },
  gen5: { short: 'Gen 5', long: 'Gen 5 (BW, B2W2)' },
  gen6: { short: 'Gen 6', long: 'Gen 6 (XY, ORAS)' },
  gen7: { short: 'Gen 7', long: 'Gen 7 (SM, USUM)' },
  home: { short: 'HOME', long: 'Pokémon HOME' },
};

export type RibbonOrigin =
  | 'rse' | 'frlg' | 'colosseum-xd'
  | 'dppt' | 'hgss'
  | 'bw' | 'b2w2'
  | 'xy' | 'oras'
  | 'sm' | 'usum' | 'vc';

export const ORIGINS: Array<{ id: RibbonOrigin; label: string; stage: RibbonStage }> = [
  { id: 'rse', label: 'Ruby, Sapphire or Emerald', stage: 'gen3' },
  { id: 'frlg', label: 'FireRed or LeafGreen (GBA)', stage: 'gen3' },
  { id: 'colosseum-xd', label: 'Colosseum or XD', stage: 'gen3' },
  { id: 'dppt', label: 'Diamond, Pearl or Platinum', stage: 'gen4' },
  { id: 'hgss', label: 'HeartGold or SoulSilver', stage: 'gen4' },
  { id: 'bw', label: 'Black or White', stage: 'gen5' },
  { id: 'b2w2', label: 'Black 2 or White 2', stage: 'gen5' },
  { id: 'xy', label: 'X or Y', stage: 'gen6' },
  { id: 'oras', label: 'Omega Ruby or Alpha Sapphire', stage: 'gen6' },
  { id: 'sm', label: 'Sun or Moon', stage: 'gen7' },
  { id: 'usum', label: 'Ultra Sun or Ultra Moon', stage: 'gen7' },
  { id: 'vc', label: 'Virtual Console (Gen 1 or 2 on 3DS)', stage: 'gen7' },
];

export function originById(id: string) {
  return ORIGINS.find((origin) => origin.id === id);
}

/** The one-way door out of each stage. */
export const DOORS: Record<Exclude<RibbonStage, 'home'>, { name: string; how: string }> = {
  gen3: {
    name: 'Pal Park',
    how: 'Needs a DS or DS Lite with a GBA slot and a Gen 4 game with the National Dex. Nothing comes back to Gen 3.',
  },
  gen4: {
    name: 'Poké Transfer',
    how: 'From Black, White, Black 2 or White 2, with a second DS running the Gen 4 game. Nothing comes back to Gen 4.',
  },
  gen5: {
    name: 'Poké Transporter → Bank',
    how: 'Transporter on 3DS moves the whole Gen 5 Box 1 into Bank. From Bank it can go into X, Y, ORAS, SM or USUM.',
  },
  gen6: {
    name: 'Bank → Gen 7',
    how: 'Withdraw it into Sun, Moon, Ultra Sun or Ultra Moon. Once it has been in a Gen 7 game it can never return to Gen 6.',
  },
  gen7: {
    name: 'Bank → HOME',
    how: 'The last door. HOME never sends anything back, and this door closes for good when Bank shuts down.',
  },
};

export interface Ribbon {
  id: string;
  name: string;
  /** Heading it's grouped under in the planner. */
  group: string;
  how: string;
  /** Stages where it can be earned. The planner shows it at the first one still reachable. */
  stages: RibbonStage[];
  /** Only Pokémon with one of these origins can get it at all. */
  onlyOrigins?: RibbonOrigin[];
  /** Real ribbon, but the service it needed is gone. Shown, never required. */
  unobtainable?: boolean;
}

const CONTEST_CATEGORIES = ['Cool', 'Beauty', 'Cute', 'Smart', 'Tough'] as const;

const gen3Contests: Ribbon[] = CONTEST_CATEGORIES.flatMap((category) =>
  (['Normal', 'Super', 'Hyper', 'Master'] as const).map((rank) => ({
    id: `g3-${category.toLowerCase()}-${rank.toLowerCase()}`,
    name: rank === 'Normal' ? `${category} Ribbon` : `${category} Ribbon ${rank}`,
    group: 'Hoenn Contests',
    how: `Win the ${rank} Rank ${category} Contest in Ruby, Sapphire or Emerald.`,
    stages: ['gen3'] as RibbonStage[],
  })),
);

const gen4Contests: Ribbon[] = CONTEST_CATEGORIES.flatMap((category) =>
  (['Normal', 'Great', 'Ultra', 'Master'] as const).map((rank) => ({
    id: `g4-${category.toLowerCase()}-${rank.toLowerCase()}`,
    name: rank === 'Normal' ? `${category} Ribbon (Sinnoh)` : `${category} Ribbon ${rank} (Sinnoh)`,
    group: 'Sinnoh Super Contests',
    how: `Win the ${rank} Rank ${category} Super Contest in Diamond, Pearl or Platinum.`,
    stages: ['gen4'] as RibbonStage[],
  })),
);

const DAILY_RIBBONS: Array<[string, string]> = [
  ['Alert', 'Monday'],
  ['Shock', 'Tuesday'],
  ['Downcast', 'Wednesday'],
  ['Careless', 'Thursday'],
  ['Relax', 'Friday'],
  ['Snooze', 'Saturday'],
  ['Smile', 'Sunday'],
];

export const RIBBONS: Ribbon[] = [
  // ---- Gen 3 -------------------------------------------------
  { id: 'g3-champion', name: 'Champion Ribbon', group: 'Gen 3 battles', how: 'Enter the Hall of Fame in Ruby, Sapphire, Emerald, FireRed or LeafGreen.', stages: ['gen3'] },
  { id: 'g3-winning', name: 'Winning Ribbon', group: 'Gen 3 battles', how: 'Clear the Level 50 Battle Tower challenge in Ruby, Sapphire or Emerald.', stages: ['gen3'] },
  { id: 'g3-victory', name: 'Victory Ribbon', group: 'Gen 3 battles', how: 'Clear the Level 100 / Open Level Battle Tower challenge in Ruby, Sapphire or Emerald.', stages: ['gen3'] },
  { id: 'g3-national', name: 'National Ribbon', group: 'Colosseum and XD', how: 'Purify it as a Shadow Pokémon in Colosseum or XD.', stages: ['gen3'], onlyOrigins: ['colosseum-xd'] },
  { id: 'g3-earth', name: 'Earth Ribbon', group: 'Colosseum and XD', how: 'Win 100 battles in a row at Mt. Battle in Colosseum or XD.', stages: ['gen3'] },
  ...gen3Contests,
  { id: 'g3-artist', name: 'Artist Ribbon', group: 'Hoenn Contests', how: 'Win a Master Rank contest and let the Lilycove Museum keep its portrait.', stages: ['gen3'] },
  { id: 'effort', name: 'Effort Ribbon', group: 'Any generation', how: 'Max out its EVs, then visit the Effort Ribbon giver. Earliest chance shown; later games have it too.', stages: ['gen3', 'gen4', 'gen6', 'gen7'] },

  // ---- Gen 4 -------------------------------------------------
  { id: 'g4-sinnoh-champion', name: 'Sinnoh Champion Ribbon', group: 'Gen 4 battles', how: 'Enter the Hall of Fame in Diamond, Pearl or Platinum.', stages: ['gen4'] },
  { id: 'g4-legend', name: 'Legend Ribbon', group: 'Gen 4 battles', how: 'Beat Red at Mt. Silver in HeartGold or SoulSilver.', stages: ['gen4'] },
  { id: 'g4-ability', name: 'Ability Ribbon', group: 'Battle Tower (DPPt or HGSS)', how: 'Beat the Tower Tycoon in Single Battles.', stages: ['gen4'] },
  { id: 'g4-great-ability', name: 'Great Ability Ribbon', group: 'Battle Tower (DPPt or HGSS)', how: 'Beat the Tower Tycoon a second time.', stages: ['gen4'] },
  { id: 'g4-double-ability', name: 'Double Ability Ribbon', group: 'Battle Tower (DPPt or HGSS)', how: 'Win 50 Double Battles in a row.', stages: ['gen4'] },
  { id: 'g4-multi-ability', name: 'Multi Ability Ribbon', group: 'Battle Tower (DPPt or HGSS)', how: 'Win 50 Multi Battles in a row with an in-game partner.', stages: ['gen4'] },
  { id: 'g4-pair-ability', name: 'Pair Ability Ribbon', group: 'Battle Tower (DPPt or HGSS)', how: 'Win 50 Multi Battles in a row with a friend. Needs a second DS and a second player.', stages: ['gen4'] },
  { id: 'g4-world-ability', name: 'World Ability Ribbon', group: 'Battle Tower (DPPt or HGSS)', how: 'Needed Nintendo Wi-Fi Connection, which closed in 2014. Can no longer be earned.', stages: ['gen4'], unobtainable: true },
  ...gen4Contests,
  ...DAILY_RIBBONS.map(([name, day]) => ({
    id: `g4-${name.toLowerCase()}`,
    name: `${name} Ribbon`,
    group: 'Sunyshore weekday ribbons',
    how: `From Julia in Sunyshore City, only on a ${day} (DPPt).`,
    stages: ['gen4'] as RibbonStage[],
  })),
  { id: 'g4-gorgeous', name: 'Gorgeous Ribbon', group: 'Ribbon Syndicate', how: 'Buy at the Ribbon Syndicate in the Resort Area (DPPt).', stages: ['gen4'] },
  { id: 'g4-royal', name: 'Royal Ribbon', group: 'Ribbon Syndicate', how: 'Buy at the Ribbon Syndicate in the Resort Area (DPPt).', stages: ['gen4'] },
  { id: 'g4-gorgeous-royal', name: 'Gorgeous Royal Ribbon', group: 'Ribbon Syndicate', how: 'Buy at the Ribbon Syndicate in the Resort Area (DPPt). Bring a lot of money.', stages: ['gen4'] },
  { id: 'g4-footprint', name: 'Footprint Ribbon', group: 'Gen 4 extras', how: 'Show Dr. Footstep on Route 213 a Pokémon at max friendship (DPPt).', stages: ['gen4'] },

  // ---- Gen 6 -------------------------------------------------
  { id: 'g6-kalos-champion', name: 'Kalos Champion Ribbon', group: 'Gen 6 battles', how: 'Enter the Hall of Fame in X or Y.', stages: ['gen6'] },
  { id: 'g6-hoenn-champion', name: 'Hoenn Champion Ribbon', group: 'Gen 6 battles', how: 'Enter the Hall of Fame in Omega Ruby or Alpha Sapphire.', stages: ['gen6'] },
  { id: 'g6-skillful-battler', name: 'Skillful Battler Ribbon', group: 'Gen 6 battles', how: 'Beat a Chatelaine in Normal battles at the Battle Maison (XY, ORAS).', stages: ['gen6'] },
  { id: 'g6-expert-battler', name: 'Expert Battler Ribbon', group: 'Gen 6 battles', how: 'Beat a Chatelaine in Super battles at the Battle Maison (XY, ORAS).', stages: ['gen6'] },
  { id: 'g6-contest-star', name: 'Contest Star Ribbon', group: 'ORAS Contest Spectaculars', how: 'Win all five Master Rank contests in ORAS.', stages: ['gen6'] },
  ...([['Coolness', 'Cool'], ['Beauty', 'Beauty'], ['Cuteness', 'Cute'], ['Cleverness', 'Clever'], ['Toughness', 'Tough']] as const).map(([category, contest]) => ({
    id: `g6-${category.toLowerCase()}-master`,
    name: `${category} Master Ribbon`,
    group: 'ORAS Contest Spectaculars',
    how: `Win the Master Rank ${contest} contest in ORAS.`,
    stages: ['gen6'] as RibbonStage[],
  })),
  { id: 'g6-training', name: 'Training Ribbon', group: 'Gen 6 extras', how: 'Clear the secret Super Training regimens (XY, ORAS).', stages: ['gen6'] },
  { id: 'best-friends', name: 'Best Friends Ribbon', group: 'Any generation', how: 'Max affection in Pokémon-Amie (Gen 6) or Pokémon Refresh (Gen 7). Earliest chance shown.', stages: ['gen6', 'gen7'] },

  // ---- Gen 7 -------------------------------------------------
  { id: 'g7-alola-champion', name: 'Alola Champion Ribbon', group: 'Gen 7 battles', how: 'Enter the Hall of Fame in Sun, Moon, Ultra Sun or Ultra Moon.', stages: ['gen7'] },
  { id: 'g7-battle-royal-master', name: 'Battle Royal Master Ribbon', group: 'Gen 7 battles', how: 'Win at Master Rank in the Battle Royal Dome.', stages: ['gen7'] },
  { id: 'g7-battle-tree-great', name: 'Battle Tree Great Ribbon', group: 'Gen 7 battles', how: 'Beat a Battle Legend in Normal battles at the Battle Tree.', stages: ['gen7'] },
  { id: 'g7-battle-tree-master', name: 'Battle Tree Master Ribbon', group: 'Gen 7 battles', how: 'Beat a Battle Legend in Super battles at the Battle Tree.', stages: ['gen7'] },
];

const stageIndex = (stage: RibbonStage) => STAGE_ORDER.indexOf(stage);

/** The stage a plan starts at, from its origin game. */
export function startStage(origin: RibbonOrigin): RibbonStage {
  return originById(origin)?.stage ?? 'gen7';
}

/**
 * Every ribbon this Pokémon can still chase, placed at the earliest stage it
 * can earn it from its origin onward. Unobtainable ones are kept for display.
 */
export function ribbonsForOrigin(origin: RibbonOrigin): Array<Ribbon & { stage: RibbonStage }> {
  const from = stageIndex(startStage(origin));
  return RIBBONS.flatMap((ribbon) => {
    if (ribbon.onlyOrigins && !ribbon.onlyOrigins.includes(origin)) return [];
    const stage = ribbon.stages.find((candidate) => stageIndex(candidate) >= from);
    return stage ? [{ ...ribbon, stage }] : [];
  });
}

export function nextStage(stage: RibbonStage): RibbonStage | null {
  const index = stageIndex(stage);
  return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null;
}

export function previousStage(stage: RibbonStage, origin: RibbonOrigin): RibbonStage | null {
  const index = stageIndex(stage);
  return index > stageIndex(startStage(origin)) ? STAGE_ORDER[index - 1] : null;
}

export function isStageBefore(a: RibbonStage, b: RibbonStage) {
  return stageIndex(a) < stageIndex(b);
}

export interface StageProgress {
  stage: RibbonStage;
  ribbons: Array<Ribbon & { stage: RibbonStage }>;
  /** Ribbons that still block the door out of this stage. */
  remaining: number;
}

export function planProgress(origin: RibbonOrigin, completed: string[], skipped: string[]) {
  const done = new Set(completed);
  const skip = new Set(skipped);
  const ribbons = ribbonsForOrigin(origin);
  const start = stageIndex(startStage(origin));
  const stages: StageProgress[] = STAGE_ORDER.slice(start, -1).map((stage) => {
    const here = ribbons.filter((ribbon) => ribbon.stage === stage);
    return {
      stage,
      ribbons: here,
      remaining: here.filter((r) => !r.unobtainable && !done.has(r.id) && !skip.has(r.id)).length,
    };
  });
  const countable = ribbons.filter((r) => !r.unobtainable && !skip.has(r.id));
  return {
    stages,
    earned: countable.filter((r) => done.has(r.id)).length,
    target: countable.length,
  };
}
