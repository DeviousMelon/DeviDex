// Breeding rules that don't depend on a specific game. Pure, no React.
// Shiny odds: Bulbapedia "Masuda method".

export type BreedingSpecies = {
  speciesId: number;
  eggGroupSlugs: string[];
  genderRate: number; // eighths female, −1 genderless
  isBaby: boolean;
};

export type Compatibility =
  | { kind: 'cannot'; reason: string }
  | { kind: 'ditto-only'; reason: string }
  | { kind: 'ditto' }
  | { kind: 'normal'; groups: string[] };

/** How this species can breed at all. */
export function breedingRule(species: BreedingSpecies): Compatibility {
  if (species.eggGroupSlugs.includes('no-eggs')) {
    return { kind: 'cannot', reason: species.isBaby ? 'Baby Pokémon can’t breed until they evolve.' : 'In the Undiscovered egg group, so it can’t breed at all.' };
  }
  if (species.eggGroupSlugs.includes('ditto')) return { kind: 'ditto' };
  if (species.genderRate === -1) return { kind: 'ditto-only', reason: 'Genderless, so its only partner is Ditto.' };
  return { kind: 'normal', groups: species.eggGroupSlugs };
}

/** Can these two breed with each other? (Same species pairs included.) */
export function canBreedTogether(a: BreedingSpecies, b: BreedingSpecies) {
  const ruleA = breedingRule(a);
  const ruleB = breedingRule(b);
  if (ruleA.kind === 'cannot' || ruleB.kind === 'cannot') return false;
  if (ruleA.kind === 'ditto' && ruleB.kind === 'ditto') return false;
  if (ruleA.kind === 'ditto' || ruleB.kind === 'ditto') return true;
  if (ruleA.kind === 'ditto-only' || ruleB.kind === 'ditto-only') return false;
  // Needs a male and a female between them.
  const aMale = a.genderRate < 8;
  const aFemale = a.genderRate > 0;
  const bMale = b.genderRate < 8;
  const bFemale = b.genderRate > 0;
  if (!((aMale && bFemale) || (aFemale && bMale))) return false;
  return a.eggGroupSlugs.some((group) => b.eggGroupSlugs.includes(group));
}

/** "87.5% male, 12.5% female", "Genderless", "Always female". */
export function genderRatioLabel(genderRate: number) {
  if (genderRate === -1) return 'Genderless';
  if (genderRate === 0) return 'Always male';
  if (genderRate === 8) return 'Always female';
  const female = (genderRate / 8) * 100;
  return `${100 - female}% male, ${female}% female`;
}

export type ShinyBreedingOdds = { label: string; base: string; masuda: string; masudaCharm: string; note?: string };

export const SHINY_BREEDING_ODDS: ShinyBreedingOdds[] = [
  { label: 'Gen IV', base: '1 in 8,192', masuda: '1 in 1,638', masudaCharm: '— (no Shiny Charm)' },
  { label: 'Gen V', base: '1 in 8,192', masuda: '1 in 1,365', masudaCharm: '1 in 1,024' },
  { label: 'Gen VI–VII', base: '1 in 4,096', masuda: '1 in 683', masudaCharm: '1 in 512' },
  {
    label: 'Gen VIII–IX',
    base: '1 in 4,096',
    masuda: '1 in 683',
    masudaCharm: '1 in 512',
    note: 'A bug skips one roll when Masuda applies, so these are a little worse than intended.',
  },
];
