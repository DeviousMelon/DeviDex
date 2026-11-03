import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { GameSelect, PokemonTile, ToolPokemonSlot, ToolState, TypeBadge } from '../../components/tools/ToolBits';
import { useFormParam, useSearchParamState } from '../../hooks/useFormParam';
import { usePokemonDirectory, type DirectoryEntry, type PokemonDirectory } from '../../hooks/usePokemonDirectory';
import { useReference } from '../../hooks/useReference';
import { SHINY_BREEDING_ODDS, breedingRule, canBreedTogether, genderRatioLabel, type BreedingSpecies } from '../../lib/breeding';
import { gameFamilyForVersionGroup } from '../../lib/gameContext';
import { moveLearnMethodLabel } from '../../lib/pokeapi';
import { learnsetFor, loadEggGroups, loadMoves, loadTypeChart, loadVersionGroups, whoLearns } from '../../lib/referenceClient';
import type { RefEggGroup, RefMove } from '../../lib/referenceData';

function asBreeding(item: DirectoryEntry, eggGroups: Map<number, RefEggGroup>): BreedingSpecies | null {
  if (!item.species) return null;
  return {
    speciesId: item.species.species_id,
    eggGroupSlugs: item.species.egg_group_ids.flatMap((id) => (eggGroups.get(id) ? [eggGroups.get(id)!.slug] : [])),
    genderRate: item.species.gender_rate,
    isBaby: item.species.is_baby,
  };
}

/** First stage of the evolution line: that's where egg moves are listed. */
function firstStage(directory: PokemonDirectory, item: DirectoryEntry) {
  const speciesBase = new Map(directory.all.filter((row) => row.pokemon.is_default).map((row) => [row.pokemon.species_id, row]));
  let current = item;
  for (let guard = 0; guard < 5; guard += 1) {
    const parent = current.species?.evolves_from_species_id;
    const next = parent != null ? speciesBase.get(parent) : undefined;
    if (!next) break;
    current = next;
  }
  return current;
}

export function BreedingPage() {
  const [entry, setFormId] = useFormParam();
  const [versionGroup, setVersionGroup] = useSearchParamState('vg', 'scarlet-violet');
  const generation = gameFamilyForVersionGroup(versionGroup)?.generation ?? 9;
  const { directory, error, loading } = usePokemonDirectory();
  const reference = useReference(() => Promise.all([loadEggGroups(), loadVersionGroups(), loadMoves(), loadTypeChart()]), []);
  const [partnerSearch, setPartnerSearch] = useState('');

  const eggGroups = useMemo(() => new Map((reference.data?.[0] ?? []).map((group) => [group.id, group])), [reference.data]);
  const versionGroupId = reference.data?.[1].find((group) => group.slug === versionGroup)?.id ?? null;
  const movesById = useMemo(() => new Map((reference.data?.[2] ?? []).map((move) => [move.id, move])), [reference.data]);

  const target = useMemo(() => {
    if (!directory || !entry) return null;
    const pokemonId = directory.pokemonIdForForm.get(entry.formId);
    return pokemonId != null ? directory.byPokemonId.get(pokemonId) ?? null : null;
  }, [directory, entry]);

  const targetBreeding = target ? asBreeding(target, eggGroups) : null;
  const rule = targetBreeding ? breedingRule(targetBreeding) : null;
  const eggSource = directory && target ? firstStage(directory, target) : null;

  const partners = useMemo(() => {
    if (!directory || !targetBreeding || !target) return [];
    const needle = partnerSearch.trim().toLowerCase();
    return directory.all.filter((item) => {
      // One tile per species; its own species is covered by the footnote.
      if (!item.pokemon.is_default || item.pokemon.species_id === target.pokemon.species_id) return false;
      const other = asBreeding(item, eggGroups);
      if (!other || !canBreedTogether(targetBreeding, other)) return false;
      return !needle || item.label.toLowerCase().includes(needle);
    });
  }, [directory, eggGroups, partnerSearch, target, targetBreeding]);

  const eggMoves = useReference(
    () => (eggSource && versionGroupId != null ? learnsetFor(eggSource.pokemon.id, versionGroupId, 'egg') : Promise.resolve([])),
    [eggSource?.pokemon.id, versionGroupId],
  );

  const typeById = new Map((reference.data?.[3].types ?? []).map((type) => [type.id, type]));
  const breedingGame = gameFamilyForVersionGroup(versionGroup)?.breedingSupported ?? true;

  return (
    <main className="tools-page">
      <PageHeader
        back={<Link to="/tools">← All tools</Link>}
        title="Breeding"
        description="Who a Pokémon can breed with, which egg moves it can learn in a game, and who can pass each one down."
      />

      <div className="tool-layout">
        <section className="panel tool-panel" aria-labelledby="breed-setup">
          <h2 id="breed-setup">Pokémon</h2>
          <ToolPokemonSlot entry={entry} label="Pokémon to breed" onPick={setFormId}>
            {target?.species && (
              <span className="tool-slot__meta">
                {target.species.egg_group_ids.map((id) => <span key={id} className="pokemon-tag">{eggGroups.get(id)?.name ?? id}</span>)}
              </span>
            )}
          </ToolPokemonSlot>

          <label className="tool-field">
            <span>Game</span>
            <GameSelect value={versionGroup} onChange={setVersionGroup} filter={(family) => family.breedingSupported} />
          </label>

          <ToolState loading={Boolean(entry) && (loading || reference.loading)} error={error ?? reference.error} />

          {target?.species && rule && (
            <dl className="pokemon-facts tool-facts">
              <div><dt>Can breed?</dt><dd>{rule.kind === 'cannot' ? rule.reason : rule.kind === 'ditto-only' ? rule.reason : rule.kind === 'ditto' ? 'It’s Ditto: it breeds with almost anything.' : 'Yes, with a partner from a shared egg group, or Ditto.'}</dd></div>
              <div><dt>Gender</dt><dd>{genderRatioLabel(target.species.gender_rate)}</dd></div>
              <div><dt>Egg cycles</dt><dd>{target.species.hatch_counter ?? '—'}</dd></div>
              {eggSource && eggSource.pokemon.id !== target.pokemon.id && (
                <div><dt>Hatches as</dt><dd>{eggSource.label}</dd></div>
              )}
            </dl>
          )}
        </section>

        <section className="panel tool-panel" aria-labelledby="egg-moves-title">
          <div className="panel__head">
            <h2 id="egg-moves-title">Egg moves</h2>
            {eggSource && <span className="muted">{eggSource.label}</span>}
          </div>
          {!entry && <p className="muted">Choose a Pokémon to see its egg moves.</p>}
          {!breedingGame && <p className="muted">There’s no breeding in this game.</p>}
          {entry && <ToolState loading={eggMoves.loading} error={eggMoves.error} />}
          {entry && eggMoves.data && eggMoves.data.length === 0 && !eggMoves.loading && (
            <p className="muted">No egg moves in this game.</p>
          )}
          {eggMoves.data && eggMoves.data.length > 0 && directory && targetBreeding && versionGroupId != null && (
            <ul className="egg-move-list">
              {eggMoves.data
                .map((row) => movesById.get(row.move_id))
                .filter((move): move is RefMove => Boolean(move))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((move) => (
                  <EggMoveRow
                    key={move.id}
                    move={move}
                    typeName={typeById.get(move.type_id)?.name ?? ''}
                    typeSlug={typeById.get(move.type_id)?.slug ?? ''}
                    versionGroupId={versionGroupId}
                    directory={directory}
                    target={targetBreeding}
                    eggGroups={eggGroups}
                    generation={generation}
                  />
                ))}
            </ul>
          )}
        </section>
      </div>

      {target && rule && (rule.kind === 'normal' || rule.kind === 'ditto-only' || rule.kind === 'ditto') && (
        <section className="panel tool-panel" aria-labelledby="partners-title">
          <div className="panel__head">
            <h2 id="partners-title">Breeding partners</h2>
            <span className="muted">{partners.length.toLocaleString()} species</span>
          </div>
          {rule.kind === 'ditto' ? (
            <p className="muted">Ditto breeds with every Pokémon that can breed, except another Ditto.</p>
          ) : (
            <>
              <input
                className="tool-search"
                type="search"
                value={partnerSearch}
                onChange={(event) => setPartnerSearch(event.target.value)}
                placeholder="Filter partners"
                aria-label="Filter breeding partners"
              />
              <div className="tool-tiles">
                {partners.map((item) => <PokemonTile key={item.pokemon.id} item={item} />)}
              </div>
              <p className="tool-footnote">Not every partner appears in every game. Same-species pairs work whenever the species has both genders.</p>
            </>
          )}
        </section>
      )}

      <div className="tool-layout">
        <section className="panel tool-panel" aria-labelledby="shiny-title">
          <h2 id="shiny-title">Shiny odds when breeding</h2>
          <div className="tool-table-scroll">
            <table className="tool-table">
              <thead>
                <tr><th scope="col">Games</th><th scope="col">Normal</th><th scope="col">Masuda</th><th scope="col">Masuda + Shiny Charm</th></tr>
              </thead>
              <tbody>
                {SHINY_BREEDING_ODDS.map((row) => (
                  <tr key={row.label}><th scope="row">{row.label}</th><td>{row.base}</td><td>{row.masuda}</td><td>{row.masudaCharm}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tool-footnote">
            The Masuda method needs parents from games of different languages. {SHINY_BREEDING_ODDS[3].note}
          </p>
        </section>

        <section className="panel tool-panel" aria-labelledby="inherit-title">
          <h2 id="inherit-title">What passes down (Gen VI onward)</h2>
          <ul className="tool-bullets">
            <li><strong>IVs:</strong> 3 from the parents, or 5 if either holds a Destiny Knot. A Power item locks in that one stat.</li>
            <li><strong>Nature:</strong> an Everstone on either parent passes its nature.</li>
            <li><strong>Hidden Ability:</strong> usually 60% from the female; when breeding with Ditto, the non-Ditto parent can pass it (Gen VII onward).</li>
            <li><strong>Poké Ball:</strong> the mother’s ball; from Gen VII, either parent’s if they’re the same species. Master and Cherish Balls never pass.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function EggMoveRow({
  move, typeName, typeSlug, versionGroupId, directory, target, eggGroups, generation,
}: {
  move: RefMove;
  typeName: string;
  typeSlug: string;
  versionGroupId: number;
  directory: PokemonDirectory;
  target: BreedingSpecies;
  eggGroups: Map<number, RefEggGroup>;
  generation: number;
}) {
  const [open, setOpen] = useState(false);
  const learners = useReference(
    () => (open ? whoLearns(move.id, versionGroupId) : Promise.resolve([])),
    [open, move.id, versionGroupId],
  );

  const parents = useMemo(() => {
    const byPokemon = new Map<number, Set<string>>();
    for (const row of learners.data ?? []) {
      const item = directory.byPokemonId.get(row.pokemon_id);
      const other = item ? asBreeding(item, eggGroups) : null;
      if (!item || !other || !canBreedTogether(target, other)) continue;
      // Before Gen VI only the father passes egg moves, so it must be able to be male.
      if (generation < 6 && other.genderRate === 8) continue;
      const methods = byPokemon.get(row.pokemon_id) ?? new Set<string>();
      methods.add(moveLearnMethodLabel(row.learn_method));
      byPokemon.set(row.pokemon_id, methods);
    }
    return [...byPokemon.entries()]
      .map(([id, methods]) => ({ item: directory.byPokemonId.get(id)!, methods: [...methods].join(', ') }))
      .sort((a, b) => a.item.dexNumber - b.item.dexNumber);
  }, [directory, eggGroups, generation, learners.data, target]);

  return (
    <li className={`egg-move${open ? ' is-open' : ''}`}>
      <button type="button" className="egg-move__summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="egg-move__name">{move.name}</span>
        {typeSlug && <TypeBadge slug={typeSlug} name={typeName} />}
        <span className="egg-move__hint">{open ? 'Hide' : 'Who can pass it?'}</span>
      </button>
      {open && (
        <div className="egg-move__body">
          <ToolState loading={learners.loading} error={learners.error} />
          {!learners.loading && !learners.error && (parents.length ? (
            <div className="tool-tiles tool-tiles--small">
              {parents.map(({ item, methods }) => <PokemonTile key={item.pokemon.id} item={item}>{methods}</PokemonTile>)}
            </div>
          ) : <p className="muted">No compatible parent learns it in this game. It may need chain breeding from an older game.</p>)}
        </div>
      )}
    </li>
  );
}
