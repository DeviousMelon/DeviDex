// A basic Gen V–IX damage calculator. Pure functions, no React.
//
// Covers the core formula and the common modifiers: level, stats (with IVs,
// EVs, nature and stat stages), STAB and Tera STAB, type effectiveness,
// critical hits, spread moves, weather, burn, and the 16 random rolls.
// It does NOT model abilities, held items, field effects or variable-power
// moves; the "other modifier" box is there for those. Rounding follows the
// games' 4096-based fixed point, as Pokémon Showdown does.

export type StatKey = 'hp' | 'attack' | 'defense' | 'special_attack' | 'special_defense' | 'speed';
export type NatureEffect = 'boost' | 'neutral' | 'hinder';
export type Weather = 'none' | 'sun' | 'rain';

/** Round to nearest, but .5 rounds DOWN (the games' "pokeRound"). */
export function pokeRound(value: number) {
  return value % 1 > 0.5 ? Math.ceil(value) : Math.floor(value);
}

/** Multiply by a 4096-based modifier the way the games do. */
function applyModifier(value: number, modifier4096: number) {
  return pokeRound((value * modifier4096) / 4096);
}

export function calcHp(base: number, level: number, iv: number, ev: number) {
  if (base === 1) return 1; // Shedinja
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calcStat(base: number, level: number, iv: number, ev: number, nature: NatureEffect) {
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  const natureMultiplier = nature === 'boost' ? 1.1 : nature === 'hinder' ? 0.9 : 1;
  return Math.floor(raw * natureMultiplier);
}

/** Stat stages −6…+6 as a multiplier on the stat. */
export function applyStage(stat: number, stage: number) {
  const clamped = Math.max(-6, Math.min(6, stage));
  return clamped >= 0
    ? Math.floor((stat * (2 + clamped)) / 2)
    : Math.floor((stat * 2) / (2 - clamped));
}

export type DamageInput = {
  level: number;
  power: number;
  category: 'physical' | 'special';
  moveType: string;
  /** Attacker's current types, and its Tera type if Terastallized. */
  attackerTypes: string[];
  teraType: string | null;
  attackStat: number;   // before stages
  attackStage: number;
  defenseStat: number;  // before stages
  defenseStage: number;
  /** Product of the type chart multipliers against the defender, e.g. 2 or 0.5. */
  effectiveness: number;
  critical: boolean;
  spread: boolean;
  weather: Weather;
  burned: boolean;
  /** Anything else (items, abilities, screens…) as a plain multiplier. */
  otherModifier: number;
};

export type DamageResult = {
  rolls: number[];      // the 16 possible damage values, lowest first
  min: number;
  max: number;
  immune: boolean;
};

export function calculateDamage(input: DamageInput): DamageResult {
  if (input.effectiveness === 0 || input.power <= 0) {
    return { rolls: Array(16).fill(0), min: 0, max: 0, immune: input.effectiveness === 0 };
  }

  // Critical hits ignore the attacker's drops and the defender's boosts.
  const attackStage = input.critical ? Math.max(0, input.attackStage) : input.attackStage;
  const defenseStage = input.critical ? Math.min(0, input.defenseStage) : input.defenseStage;
  const attack = Math.max(1, applyStage(input.attackStat, attackStage));
  const defense = Math.max(1, applyStage(input.defenseStat, defenseStage));

  let base = Math.floor(Math.floor((Math.floor((2 * input.level) / 5) + 2) * input.power * attack / defense) / 50) + 2;

  if (input.spread) base = applyModifier(base, 3072);
  if (input.weather === 'sun') {
    if (input.moveType === 'fire') base = applyModifier(base, 6144);
    if (input.moveType === 'water') base = applyModifier(base, 2048);
  } else if (input.weather === 'rain') {
    if (input.moveType === 'water') base = applyModifier(base, 6144);
    if (input.moveType === 'fire') base = applyModifier(base, 2048);
  }
  if (input.critical) base = Math.floor(base * 1.5);

  // STAB: 1.5×, or 2× when Terastallized into a type it already had.
  const sharesOriginal = input.attackerTypes.includes(input.moveType);
  const sharesTera = input.teraType === input.moveType;
  let stab = 4096;
  if (sharesOriginal && sharesTera) stab = 8192;
  else if (sharesOriginal || sharesTera) stab = 6144;

  const other4096 = Math.round(input.otherModifier * 4096);

  const rolls: number[] = [];
  for (let roll = 85; roll <= 100; roll += 1) {
    let damage = Math.floor((base * roll) / 100);
    if (stab !== 4096) damage = applyModifier(damage, stab);
    damage = Math.floor(damage * input.effectiveness);
    if (input.burned && input.category === 'physical') damage = Math.floor(damage / 2);
    if (other4096 !== 4096) damage = applyModifier(damage, other4096);
    rolls.push(Math.max(1, damage));
  }
  return { rolls, min: rolls[0], max: rolls[15], immune: false };
}

/** "Guaranteed 2HKO", "75% chance to OHKO"… from the 16 rolls and the target's HP. */
export function koSummary(rolls: number[], hp: number) {
  if (!rolls.length || rolls[15] === 0) return 'No damage';
  for (let hits = 1; hits <= 6; hits += 1) {
    // Count roll combinations: exact for 1–2 hits, approximated beyond.
    let chance: number;
    if (hits === 1) {
      chance = rolls.filter((damage) => damage >= hp).length / 16;
    } else if (hits === 2) {
      let ko = 0;
      for (const first of rolls) for (const second of rolls) if (first + second >= hp) ko += 1;
      chance = ko / 256;
    } else {
      const minTotal = rolls[0] * hits;
      const maxTotal = rolls[15] * hits;
      chance = minTotal >= hp ? 1 : maxTotal < hp ? 0 : (maxTotal - hp + 1) / (maxTotal - minTotal + 1);
    }
    const label = hits === 1 ? 'OHKO' : `${hits}HKO`;
    if (chance >= 1) return `Guaranteed ${label}`;
    if (chance > 0) return `${Math.round(chance * 1000) / 10}% chance to ${label}${hits > 2 ? ' (approx.)' : ''}`;
  }
  return 'Takes 7 or more hits';
}
