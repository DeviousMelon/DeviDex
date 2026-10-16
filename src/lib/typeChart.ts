// Type effectiveness, generation-aware. Pure: feed it the ref_types /
// ref_type_efficacy / ref_type_efficacy_past rows (see referenceClient.ts).

export type ChartType = { id: number; slug: string; name: string; generation: number };
export type EfficacyRow = { attacking_type_id: number; defending_type_id: number; damage_factor: number };
export type PastEfficacyRow = EfficacyRow & { until_generation: number };

export type TypeChart = {
  types: ChartType[];
  bySlug: Map<string, ChartType>;
  current: Map<string, number>;
  past: PastEfficacyRow[];
};

const key = (attacking: number, defending: number) => `${attacking}:${defending}`;

export function buildTypeChart(types: ChartType[], efficacy: EfficacyRow[], past: PastEfficacyRow[]): TypeChart {
  return {
    // Stellar (Tera-only) is never a defending type and has no chart row.
    types: types.filter((type) => type.slug !== 'stellar').sort((a, b) => a.id - b.id),
    bySlug: new Map(types.map((type) => [type.slug, type])),
    current: new Map(efficacy.map((row) => [key(row.attacking_type_id, row.defending_type_id), row.damage_factor])),
    past: [...past].sort((a, b) => a.until_generation - b.until_generation),
  };
}

/** The types that exist in a generation (no Dark/Steel in Gen 1, no Fairy before Gen 6). */
export function typesInGeneration(chart: TypeChart, generation: number) {
  return chart.types.filter((type) => type.generation <= generation);
}

/** One attacking type against one defending type, as a multiplier (0, 0.5, 1, 2). */
export function singleMultiplier(chart: TypeChart, attackingId: number, defendingId: number, generation: number) {
  // Old charts: the earliest rule still in force in this generation wins.
  const old = chart.past.find((row) =>
    row.attacking_type_id === attackingId && row.defending_type_id === defendingId && row.until_generation >= generation);
  const factor = old ? old.damage_factor : chart.current.get(key(attackingId, defendingId)) ?? 100;
  return factor / 100;
}

/** An attacking type against a Pokémon's one or two types. */
export function multiplierAgainst(chart: TypeChart, attackingSlug: string, defendingSlugs: string[], generation: number) {
  const attacking = chart.bySlug.get(attackingSlug);
  if (!attacking) return 1;
  return defendingSlugs.reduce((total, slug) => {
    const defending = chart.bySlug.get(slug);
    return defending ? total * singleMultiplier(chart, attacking.id, defending.id, generation) : total;
  }, 1);
}

export type DefensiveProfile = Array<{ type: ChartType; multiplier: number }>;

/** How every attacking type in that generation hits a Pokémon with these types. */
export function defensiveProfile(chart: TypeChart, defendingSlugs: string[], generation: number): DefensiveProfile {
  return typesInGeneration(chart, generation).map((type) => ({
    type,
    multiplier: multiplierAgainst(chart, type.slug, defendingSlugs, generation),
  }));
}

/** "4×", "½×", "¼×", "0×" for display. */
export function formatMultiplier(multiplier: number) {
  if (multiplier === 0.5) return '½×';
  if (multiplier === 0.25) return '¼×';
  return `${multiplier}×`;
}
