import { Link } from 'react-router-dom';
import { useReference } from '../../hooks/useReference';
import { loadTypeChart } from '../../lib/referenceClient';
import { defensiveProfile, formatMultiplier } from '../../lib/typeChart';
import { ToolState, TypeBadge } from './ToolBits';

const BANDS = [
  { multiplier: 4, label: 'Takes 4×' },
  { multiplier: 2, label: 'Takes 2×' },
  { multiplier: 0.5, label: 'Takes ½×' },
  { multiplier: 0.25, label: 'Takes ¼×' },
  { multiplier: 0, label: 'Immune' },
];

/** Weaknesses and resistances for a Pokémon's types in the chosen generation. */
export function TypeMatchupsPanel({ typeSlugs, generation }: { typeSlugs: string[]; generation: number }) {
  const chart = useReference(loadTypeChart, []);
  const profile = chart.data && typeSlugs.length ? defensiveProfile(chart.data, typeSlugs, generation) : [];

  // Before the reference data is imported, quietly show nothing.
  if (chart.error) return null;

  return (
    <section className="panel pokemon-matchups" aria-labelledby="matchups-title">
      <div className="panel__head">
        <h2 id="matchups-title">Type matchups</h2>
        <Link to={`/tools/types?era=${generation >= 6 ? 9 : generation >= 2 ? 5 : 1}`}>Full chart</Link>
      </div>
      <ToolState loading={chart.loading} />
      {profile.length > 0 && (
        <dl className="matchup-bands">
          {BANDS.map((band) => {
            const types = profile.filter((row) => row.multiplier === band.multiplier);
            if (!types.length) return null;
            return (
              <div key={band.multiplier} className={`matchup-band matchup-band--${band.multiplier > 1 ? 'weak' : band.multiplier === 0 ? 'immune' : 'resist'}`}>
                <dt>{band.label}</dt>
                <dd>{types.map(({ type }) => <TypeBadge key={type.id} slug={type.slug} name={type.name} />)}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {profile.length > 0 && !profile.some((row) => row.multiplier !== 1) && (
        <p className="muted">Everything hits it for {formatMultiplier(1)}.</p>
      )}
    </section>
  );
}

/** Shortcuts from a Pokémon page into the Tools, pre-filled with this form. */
export function PokemonToolLinks({
  formSlug, generation, versionGroup, breedingSupported,
}: {
  formSlug: string;
  generation: number;
  versionGroup: string;
  breedingSupported: boolean;
}) {
  const form = encodeURIComponent(formSlug);
  const catchGen = generation >= 9 ? '9' : generation === 8 ? '8' : generation === 7 ? '7' : generation === 6 ? '6' : generation === 5 ? '5' : '3-4';
  const links = [
    generation >= 3 && { to: `/tools/catch?form=${form}&gen=${catchGen}`, title: 'Catch odds', body: 'Best ball for this one' },
    breedingSupported && { to: `/tools/breeding?form=${form}&vg=${encodeURIComponent(versionGroup)}`, title: 'Breeding', body: 'Partners and egg moves' },
    { to: `/tools/damage?atk=${form}`, title: 'Damage calc', body: 'How hard it hits' },
    { to: `/tools/types?view=team&team=${form}`, title: 'Team coverage', body: 'Start a team with it' },
  ].filter((link): link is { to: string; title: string; body: string } => Boolean(link));

  return (
    <section className="panel pokemon-tools" aria-labelledby="pokemon-tools-title">
      <div className="panel__head">
        <h2 id="pokemon-tools-title">Tools</h2>
        <Link to="/tools">All tools</Link>
      </div>
      <ul className="pokemon-tools__list">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to}>
              <strong>{link.title}</strong>
              <span>{link.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
