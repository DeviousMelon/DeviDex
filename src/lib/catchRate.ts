// Catch odds, per generation. Pure functions, no React.
//
// Sources: Bulbapedia "Catch rate" (Gen III–VII formulas) and The Cave of
// Dragonflies' Gen VI/VII, Gen VIII and Gen IX capture mechanics pages
// (ball values, level/badge/difficulty modifiers, critical captures).
// Let's Go, Legends: Arceus and Legends: Z-A use different systems and are
// deliberately not offered.

export type CatchGeneration = '3-4' | '5' | '6' | '7' | '8' | '9';

export const CATCH_GENERATIONS: Array<{ id: CatchGeneration; label: string; games: string }> = [
  { id: '9', label: 'Gen IX', games: 'Scarlet / Violet' },
  { id: '8', label: 'Gen VIII', games: 'Sword / Shield, BDSP' },
  { id: '7', label: 'Gen VII', games: 'Sun / Moon, USUM' },
  { id: '6', label: 'Gen VI', games: 'X / Y, ORAS' },
  { id: '5', label: 'Gen V', games: 'Black / White, B2W2' },
  { id: '3-4', label: 'Gen III–IV', games: 'RSE, FRLG, DPPt, HGSS' },
];

export type CatchStatus = 'none' | 'sleep' | 'freeze' | 'paralysis' | 'poison' | 'burn';

export type BallId =
  | 'poke' | 'great' | 'ultra' | 'master' | 'quick' | 'timer' | 'dusk' | 'net' | 'nest'
  | 'repeat' | 'dive' | 'level' | 'fast' | 'heavy' | 'moon' | 'love' | 'lure' | 'dream' | 'beast';

/** Situational facts some balls care about. Only the chosen ball's ones are asked for. */
export type BallContext = {
  turn: number;               // 1 = first turn
  nightOrCave: boolean;
  inWater: boolean;           // Dive (and Lure in Gen IX)
  fishing: boolean;           // Lure, Gen VII–VIII
  alreadyCaught: boolean;     // Repeat
  yourLevel: number;          // Level Ball
  sameSpeciesOppositeGender: boolean; // Love Ball
};

export type CatchTarget = {
  catchRate: number;
  level: number;
  types: string[];            // type slugs
  baseSpeed: number;
  weightKg: number;
  speciesSlug: string;
};

const ULTRA_BEASTS = new Set([
  'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana',
  'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon',
]);

// Gen VII+ only counts species that evolve with a Moon Stone themselves.
const MOON_STONE_EVOLVERS = new Set(['nidorina', 'nidorino', 'clefairy', 'jigglypuff', 'skitty', 'munna']);

const genNumber = (generation: CatchGeneration) => (generation === '3-4' ? 4 : Number(generation));

export type BallInfo = { id: BallId; name: string; from: number; asks: Array<keyof BallContext>; note: string };

// "from" is the first CatchGeneration number the ball is offered for here.
// Apricorn balls existed in HGSS, but with different values; they're only
// offered from Gen VII, where the numbers are documented.
export const BALLS: BallInfo[] = [
  { id: 'poke', name: 'Poké Ball', from: 3, asks: [], note: '1×' },
  { id: 'great', name: 'Great Ball', from: 3, asks: [], note: '1.5×' },
  { id: 'ultra', name: 'Ultra Ball', from: 3, asks: [], note: '2×' },
  { id: 'master', name: 'Master Ball', from: 3, asks: [], note: 'Never fails' },
  { id: 'quick', name: 'Quick Ball', from: 4, asks: ['turn'], note: 'Best on turn 1' },
  { id: 'timer', name: 'Timer Ball', from: 3, asks: ['turn'], note: 'Better every turn, up to 4×' },
  { id: 'dusk', name: 'Dusk Ball', from: 4, asks: ['nightOrCave'], note: 'At night or in caves' },
  { id: 'net', name: 'Net Ball', from: 3, asks: [], note: 'Water and Bug types' },
  { id: 'nest', name: 'Nest Ball', from: 3, asks: [], note: 'Low-level Pokémon' },
  { id: 'repeat', name: 'Repeat Ball', from: 3, asks: ['alreadyCaught'], note: 'Species you already caught' },
  { id: 'dive', name: 'Dive Ball', from: 3, asks: ['inWater'], note: 'On or in water' },
  { id: 'level', name: 'Level Ball', from: 7, asks: ['yourLevel'], note: 'Your Pokémon out-levels it' },
  { id: 'fast', name: 'Fast Ball', from: 7, asks: [], note: 'Base Speed 100+' },
  { id: 'heavy', name: 'Heavy Ball', from: 7, asks: [], note: 'Heavy Pokémon' },
  { id: 'moon', name: 'Moon Ball', from: 7, asks: [], note: 'Moon Stone evolvers' },
  { id: 'love', name: 'Love Ball', from: 7, asks: ['sameSpeciesOppositeGender'], note: 'Same species, opposite gender' },
  { id: 'lure', name: 'Lure Ball', from: 7, asks: ['fishing', 'inWater'], note: 'Fishing (on water in Gen IX)' },
  { id: 'dream', name: 'Dream Ball', from: 8, asks: [], note: 'Sleeping Pokémon' },
  { id: 'beast', name: 'Beast Ball', from: 7, asks: [], note: 'Ultra Beasts only' },
];

export function ballsForGeneration(generation: CatchGeneration) {
  const gen = genNumber(generation);
  return BALLS.filter((ball) => ball.from <= gen);
}

/** Heavy Ball: added to the catch rate, not multiplied (Gen VII+). */
function heavyBallBonus(weightKg: number) {
  if (weightKg >= 300) return 30;
  if (weightKg >= 200) return 20;
  if (weightKg >= 100) return 0;
  return -20;
}

/** The ball's multiplier for this target and situation. Master Ball returns Infinity. */
export function ballMultiplier(ball: BallId, generation: CatchGeneration, target: CatchTarget, ctx: BallContext, status: CatchStatus) {
  const gen = genNumber(generation);
  const isUltraBeast = ULTRA_BEASTS.has(target.speciesSlug);
  const turnsPassed = Math.max(0, ctx.turn - 1);

  if (ball === 'master') return Infinity;
  // Gen VII+: every ball except the Beast Ball barely works on Ultra Beasts.
  if (isUltraBeast && gen >= 7) return ball === 'beast' ? 5 : 410 / 4096;

  switch (ball) {
    case 'poke': return 1;
    case 'great': return 1.5;
    case 'ultra': return 2;
    case 'quick': return ctx.turn === 1 ? (gen === 4 ? 4 : 5) : 1;
    case 'timer':
      return gen <= 4
        ? Math.min(4, (turnsPassed + 10) / 10)
        : Math.min(4, 1 + (turnsPassed * 1229) / 4096);
    case 'dusk': return ctx.nightOrCave ? (gen <= 6 ? 3.5 : 3) : 1;
    case 'net': return target.types.some((type) => type === 'water' || type === 'bug') ? (gen <= 6 ? 3 : 3.5) : 1;
    case 'nest':
      if (gen <= 4) return Math.max(1, (40 - target.level) / 10);
      return target.level < 30 ? (41 - target.level) / 10 : 1;
    case 'repeat': return ctx.alreadyCaught ? (gen <= 6 ? 3 : 3.5) : 1;
    case 'dive': return ctx.inWater ? 3.5 : 1;
    case 'level': {
      if (Math.floor(ctx.yourLevel / 4) >= target.level) return 8;
      if (Math.floor(ctx.yourLevel / 2) >= target.level) return 4;
      return ctx.yourLevel > target.level ? 2 : 1;
    }
    case 'fast': return target.baseSpeed >= 100 ? 4 : 1;
    case 'heavy': return 1; // handled through the catch rate
    case 'moon': return MOON_STONE_EVOLVERS.has(target.speciesSlug) ? 4 : 1;
    case 'love': return ctx.sameSpeciesOppositeGender ? 8 : 1;
    case 'lure':
      if (gen >= 9) return ctx.inWater ? 4 : 1;
      return ctx.fishing ? (gen === 7 ? 5 : 4) : 1;
    case 'dream': return status === 'sleep' ? 4 : 1;
    case 'beast': return 410 / 4096;
    default: return 1;
  }
}

export type CatchModifiers = {
  /** Gen VI O-Power / Gen VII Roto Catch / Gen V Capture Power. 1 = none. */
  power: number;
  /** Gen VI+: species caught in your Pokédex, for critical captures. */
  dexCaught: number;
  /** Gen VIII+: Catching Charm (doubles critical capture chance). */
  catchingCharm: boolean;
  /** Gen VIII: you lack the 8th badge and your Pokémon is lower level than the target. */
  swshLevelPenalty: boolean;
  /** Gen IX: gym badges you have (0–8). */
  badges: number;
  /** Gen IX: Capture Power and catching it off guard (multiplies the difficulty term). */
  svDifficulty: number;
};

export type CatchResult = {
  /** Chance one throw catches it (0–1). */
  perThrow: number;
  /** Chance a throw is a critical capture (0–1), where the game has them. */
  criticalChance: number;
  /** The modified catch rate the game works with, scaled to 0–255. */
  modifiedRate: number;
  guaranteed: boolean;
};

function statusMultiplier(status: CatchStatus, gen: number) {
  if (status === 'sleep' || status === 'freeze') return gen <= 4 ? 2 : 2.5;
  if (status === 'paralysis' || status === 'poison' || status === 'burn') return 1.5;
  return 1;
}

function dexModifier(caught: number) {
  if (caught > 600) return 2.5;
  if (caught > 450) return 2;
  if (caught > 300) return 1.5;
  if (caught > 150) return 1;
  if (caught > 30) return 0.5;
  return 0;
}

/** Gen IX badge penalty: ×0.8 for every badge short of the level the target needs. */
export function svBadgePenalty(targetLevel: number, badges: number) {
  const caps = [25, 30, 35, 40, 45, 50, 55, 60, 100];
  const needed = caps.findIndex((cap) => targetLevel <= cap);
  const missing = Math.max(0, (needed < 0 ? 8 : needed) - badges);
  return 0.8 ** missing;
}

/** Max HP from base HP and level, with average IVs (15) and no EVs. */
export function estimateMaxHp(baseHp: number, level: number) {
  if (baseHp === 1) return 1; // Shedinja
  return Math.floor(((2 * baseHp + 15) * level) / 100) + level + 10;
}

export function catchChance(input: {
  generation: CatchGeneration;
  target: CatchTarget;
  maxHp: number;
  currentHp: number;
  ball: BallId;
  ballContext: BallContext;
  status: CatchStatus;
  modifiers: CatchModifiers;
}): CatchResult {
  const { generation, target, maxHp, ball, status, modifiers } = input;
  const gen = genNumber(generation);
  const currentHp = Math.min(Math.max(1, input.currentHp), maxHp);
  const ballBonus = ballMultiplier(ball, generation, target, input.ballContext, status);
  if (!Number.isFinite(ballBonus)) return { perThrow: 1, criticalChance: 0, modifiedRate: 255, guaranteed: true };

  let rate = target.catchRate;
  if (ball === 'heavy') rate = Math.max(1, rate + heavyBallBonus(target.weightKg));
  const statusBonus = statusMultiplier(status, gen);
  const hpTerm = (3 * maxHp - 2 * currentHp) / (3 * maxHp);

  // ---- Gen III–IV: four shake checks against b ------------------------------
  if (gen <= 4) {
    const a = Math.max(1, Math.floor(hpTerm * rate * ballBonus * statusBonus));
    if (a >= 255) return { perThrow: 1, criticalChance: 0, modifiedRate: 255, guaranteed: true };
    const b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))));
    return { perThrow: Math.min(1, (b / 65536) ** 4), criticalChance: 0, modifiedRate: a, guaranteed: false };
  }

  // ---- Gen V–VII: 4096-scaled "a", compared against 1044480 ----------------
  if (gen <= 7) {
    const a = Math.floor(Math.floor(hpTerm * 4096 * rate * ballBonus) * statusBonus * modifiers.power);
    const x = a / 4096; // same 0–255 scale as later games
    if (a >= 1044480) return { perThrow: 1, criticalChance: 0, modifiedRate: 255, guaranteed: true };
    if (gen === 5) {
      // Three shake checks. Gen V critical captures depend on the Pokédex too,
      // but with a different table, so they're left out here.
      const b = Math.floor(65536 * (a / 1044480) ** 0.25);
      return { perThrow: (b / 65536) ** 3, criticalChance: 0, modifiedRate: x, guaranteed: false };
    }
    return withCriticals(x, dexModifier(modifiers.dexCaught), 1);
  }

  // ---- Gen VIII–IX --------------------------------------------------------
  let level = 1;
  let difficulty = 1;
  let badgePenalty = 1;
  if (gen === 8) {
    if (target.level < 21) level = (30 - target.level) / 10;
    if (modifiers.swshLevelPenalty) difficulty = 410 / 4096;
  } else {
    if (target.level <= 13) level = (36 - 2 * target.level) / 10;
    badgePenalty = svBadgePenalty(target.level, modifiers.badges);
    difficulty = modifiers.svDifficulty;
  }
  const x = hpTerm * rate * ballBonus * badgePenalty * level * statusBonus * difficulty;
  return withCriticals(x, dexModifier(modifiers.dexCaught), modifiers.catchingCharm ? 2 : 1);
}

/** Gen VI+ shake checks plus critical captures, on the 0–255 scale. */
function withCriticals(x: number, dex: number, charm: number): CatchResult {
  if (x >= 255) return { perThrow: 1, criticalChance: 0, modifiedRate: 255, guaranteed: true };
  const hold = Math.floor(65536 / (255 / x) ** (3 / 16)) / 65536;
  const criticalChance = Math.floor((Math.min(255, x) * dex * charm) / 6) / 256;
  const perThrow = criticalChance * hold + (1 - criticalChance) * hold ** 4;
  return { perThrow, criticalChance, modifiedRate: x, guaranteed: false };
}

/** Chance of catching it within n throws, if every throw has the same odds. */
export function chanceWithin(perThrow: number, throws: number) {
  return 1 - (1 - perThrow) ** throws;
}

/** Throws needed for a given confidence (e.g. 0.9 → 90%). */
export function throwsForConfidence(perThrow: number, confidence: number) {
  if (perThrow >= 1) return 1;
  if (perThrow <= 0) return Infinity;
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - perThrow));
}
