import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { PokemonPicker } from '../../components/PokemonPicker';
import { PokemonSprite } from '../../components/PokemonSprite';
import { ToolState, TypeBadge } from '../../components/tools/ToolBits';
import { pokemonLabel } from '../../hooks/usePokemonCatalog';
import { usePokemonDirectory } from '../../hooks/usePokemonDirectory';
import { useReference } from '../../hooks/useReference';
import { useSearchParamState } from '../../hooks/useFormParam';
import { loadPastTypings, loadTypeChart, typeIdsInGeneration } from '../../lib/referenceClient';
import { formatMultiplier, singleMultiplier, typesInGeneration, type ChartType, type TypeChart } from '../../lib/typeChart';
import type { DexCatalogEntry } from '../../types';

// The chart only changed twice, so three eras cover every game.
const ERAS = [
  { id: '9', label: 'Gen VI onward', generation: 9 },
  { id: '5', label: 'Gen II–V', generation: 5 },
  { id: '1', label: 'Gen I', generation: 1 },
];

const TEAM_SIZE = 6;

function cellClass(multiplier: number) {
  if (multiplier === 0) return 'is-immune';
  if (multiplier > 1) return 'is-weak';
  if (multiplier < 1) return 'is-resist';
  return '';
}

export function TypesPage() {
  const [eraParam, setEra] = useSearchParamState('era', '9');
  const era = ERAS.find((item) => item.id === eraParam) ?? ERAS[0];
  const [view, setView] = useSearchParamState('view', 'chart');
  const chart = useReference(loadTypeChart, []);

  return (
    <main className="tools-page">
      <PageHeader
        back={<Link to="/tools">← All tools</Link>}
        title="Type chart & team coverage"
        description="How every type matches up, and where your team is exposed."
      />

      <div className="tool-toolbar">
        <div className="segmented" role="group" aria-label="View">
          <button type="button" className={view === 'chart' ? 'is-active' : undefined} aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Type chart</button>
          <button type="button" className={view === 'team' ? 'is-active' : undefined} aria-pressed={view === 'team'} onClick={() => setView('team')}>Team coverage</button>
        </div>
        <div className="segmented" role="group" aria-label="Games">
          {ERAS.map((item) => (
            <button key={item.id} type="button" className={era.id === item.id ? 'is-active' : undefined} aria-pressed={era.id === item.id} onClick={() => setEra(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <ToolState loading={chart.loading} error={chart.error} />
      {chart.data && (view === 'team'
        ? <TeamCoverage chart={chart.data} generation={era.generation} />
        : <FullChart chart={chart.data} generation={era.generation} />)}
    </main>
  );
}

function FullChart({ chart, generation }: { chart: TypeChart; generation: number }) {
  const types = typesInGeneration(chart, generation);
  return (
    <section className="panel tool-panel" aria-labelledby="chart-title">
      <div className="panel__head">
        <h2 id="chart-title">Attacking type → defending type</h2>
      </div>
      <div className="type-chart-scroll" tabIndex={0} aria-label="Type chart, scrolls sideways">
        <table className="type-chart">
          <thead>
            <tr>
              <th scope="col" className="type-chart__corner"><span>Atk ↓ / Def →</span></th>
              {types.map((type) => (
                <th scope="col" key={type.id} title={type.name}>
                  <span className={`type-chart__head pokemon-type--${type.slug}`}>{type.name.slice(0, 3)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((attacking) => (
              <tr key={attacking.id}>
                <th scope="row"><TypeBadge slug={attacking.slug} name={attacking.name} /></th>
                {types.map((defending) => {
                  const multiplier = singleMultiplier(chart, attacking.id, defending.id, generation);
                  return (
                    <td key={defending.id} className={cellClass(multiplier)} title={`${attacking.name} → ${defending.name}: ${formatMultiplier(multiplier)}`}>
                      {multiplier === 1 ? '' : formatMultiplier(multiplier).replace('×', '')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tool-footnote">
        <span className="type-chart__key is-weak">2</span> super effective ·
        {' '}<span className="type-chart__key is-resist">½</span> not very effective ·
        {' '}<span className="type-chart__key is-immune">0</span> no effect · blank is normal damage.
      </p>
    </section>
  );
}

function TeamCoverage({ chart, generation }: { chart: TypeChart; generation: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { directory, catalog, error, loading } = usePokemonDirectory();
  const pastTypings = useReference(loadPastTypings, []);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);

  const teamSlugs = (searchParams.get('team') ?? '').split(',').filter(Boolean).slice(0, TEAM_SIZE);
  const team = useMemo(() => {
    if (!catalog) return [] as DexCatalogEntry[];
    return teamSlugs.flatMap((slug) => {
      const found = catalog.entries.find((item) => item.formSlug === slug);
      return found ? [found] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, teamSlugs.join(',')]);

  function saveTeam(next: DexCatalogEntry[]) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next.length) params.set('team', next.map((member) => member.formSlug).join(','));
      else params.delete('team');
      return params;
    }, { replace: true });
  }

  const types = typesInGeneration(chart, generation);
  const typeById = new Map(chart.types.map((type) => [type.id, type]));

  const members = useMemo(() => {
    if (!directory || !pastTypings.data) return [];
    return team.map((entry) => {
      const pokemonId = directory.pokemonIdForForm.get(entry.formId);
      const data = pokemonId != null ? directory.byPokemonId.get(pokemonId) : undefined;
      const typeIds = data ? typeIdsInGeneration(data.pokemon, pastTypings.data!, generation) : [];
      // A type that didn't exist yet (Fairy before Gen VI) simply drops out.
      const memberTypes = typeIds.flatMap((id) => {
        const type = typeById.get(id);
        return type && type.generation <= generation ? [type] : [];
      });
      return { entry, types: memberTypes };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, pastTypings.data, team, generation, chart]);

  const rows = types.map((attacking) => {
    const multipliers = members.map((member) => member.types.reduce(
      (total, defending) => total * singleMultiplier(chart, attacking.id, defending.id, generation), 1));
    const weak = multipliers.filter((value) => value > 1).length;
    const resist = multipliers.filter((value) => value < 1).length;
    return { attacking, multipliers, weak, resist };
  });
  const holes = rows
    .filter((row) => members.length > 0 && row.weak >= 2 && row.weak > row.resist)
    .sort((a, b) => (b.weak - b.resist) - (a.weak - a.resist));

  return (
    <>
      <section className="panel tool-panel" aria-labelledby="team-title">
        <div className="panel__head">
          <h2 id="team-title">Your team</h2>
          {team.length > 0 && <button type="button" className="text-button" onClick={() => saveTeam([])}>Clear</button>}
        </div>
        <ToolState loading={loading || pastTypings.loading} error={error ?? pastTypings.error} />
        <div className="team-slots">
          {Array.from({ length: TEAM_SIZE }, (_, index) => {
            const member = members[index] ?? (team[index] ? { entry: team[index], types: [] as ChartType[] } : null);
            return (
              <div className="team-slot" key={index}>
                <button
                  type="button"
                  className="team-slot__pick"
                  onClick={() => setPickingSlot(index)}
                  aria-label={member ? `Slot ${index + 1}: ${pokemonLabel(member.entry)}. Change` : `Add a Pokémon to slot ${index + 1}`}
                >
                  {member ? (
                    <PokemonSprite nationalDexNumber={member.entry.dexNumber} name={pokemonLabel(member.entry)} spriteUrl={member.entry.spriteUrl} shinySpriteUrl={member.entry.shinySpriteUrl} />
                  ) : <span aria-hidden="true">+</span>}
                </button>
                {member && (
                  <>
                    <span className="team-slot__name">{pokemonLabel(member.entry)}</span>
                    <span className="team-slot__types">{member.types.map((type) => <TypeBadge key={type.id} slug={type.slug} name={type.name} />)}</span>
                    <button type="button" className="text-button team-slot__remove" onClick={() => saveTeam(team.filter((_, i) => i !== index))}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <PokemonPicker
          open={pickingSlot != null}
          title="Add to your team"
          confirmLabel="Add"
          allowShiny={false}
          onClose={() => setPickingSlot(null)}
          onPick={({ formId }) => {
            const picked = catalog?.byFormId.get(formId);
            if (picked && pickingSlot != null) {
              const next = [...team];
              next[Math.min(pickingSlot, team.length)] = picked;
              saveTeam(next);
            }
            setPickingSlot(null);
          }}
        />
      </section>

      {members.length > 0 && (
        <>
          <section className="panel tool-panel" aria-labelledby="holes-title">
            <h2 id="holes-title">Weak spots</h2>
            {holes.length ? (
              <ul className="coverage-holes">
                {holes.map((row) => (
                  <li key={row.attacking.id}>
                    <TypeBadge slug={row.attacking.slug} name={row.attacking.name} />
                    <span>{row.weak} weak · {row.resist} resist{row.resist === 0 ? ' — nobody walls it' : ''}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No type hits two or more of your team without someone resisting it. Nice.</p>}
          </section>

          <section className="panel tool-panel" aria-labelledby="coverage-title">
            <h2 id="coverage-title">Every type against your team</h2>
            <div className="type-chart-scroll" tabIndex={0} aria-label="Team coverage table, scrolls sideways">
              <table className="type-chart type-chart--team">
                <thead>
                  <tr>
                    <th scope="col" className="type-chart__corner"><span>Attacking type</span></th>
                    {members.map((member, index) => (
                      <th scope="col" key={`${member.entry.formId}-${index}`} title={pokemonLabel(member.entry)}>
                        <PokemonSprite nationalDexNumber={member.entry.dexNumber} name={pokemonLabel(member.entry)} spriteUrl={member.entry.spriteUrl} shinySpriteUrl={member.entry.shinySpriteUrl} />
                      </th>
                    ))}
                    <th scope="col">Weak</th>
                    <th scope="col">Resist</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.attacking.id} className={row.weak >= 2 && row.weak > row.resist ? 'is-hole' : undefined}>
                      <th scope="row"><TypeBadge slug={row.attacking.slug} name={row.attacking.name} /></th>
                      {row.multipliers.map((multiplier, index) => (
                        <td key={index} className={cellClass(multiplier)}>{multiplier === 1 ? '' : formatMultiplier(multiplier)}</td>
                      ))}
                      <td className="type-chart__count">{row.weak || ''}</td>
                      <td className="type-chart__count">{row.resist || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tool-footnote">Types only: abilities like Levitate or Flash Fire aren’t counted.</p>
          </section>
        </>
      )}
    </>
  );
}
