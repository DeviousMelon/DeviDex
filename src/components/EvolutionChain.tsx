import { Link } from 'react-router-dom';
import { PokemonSprite } from './PokemonSprite';
import {
  apiResourceId,
  groupEvolutionRequirements,
  humanizeApiName,
  type EvolutionChainDetail,
  type EvolutionChainLink,
} from '../lib/pokeapi';
import { formatPokemonName } from '../lib/pokemonNames';

function withQuery(path: string, queryString: string) {
  return queryString ? `${path}?${queryString}` : path;
}

function EvolutionNode({
  node,
  currentSpeciesSlug,
  queryString,
}: {
  node: EvolutionChainLink;
  currentSpeciesSlug: string;
  queryString: string;
}) {
  const speciesId = apiResourceId(node.species.url);
  const name = formatPokemonName(node.species.name);
  const isCurrent = node.species.name === currentSpeciesSlug;

  return (
    <Link
      className={`evolution-node${isCurrent ? ' is-current' : ''}`}
      to={withQuery(`/pokemon/${node.species.name}`, queryString)}
      aria-current={isCurrent ? 'page' : undefined}
    >
      {speciesId ? (
        <PokemonSprite
          className="evolution-node__sprite"
          nationalDexNumber={speciesId}
          name={name}
        />
      ) : (
        <span className="evolution-node__sprite pokemon-sprite-failed" aria-hidden="true">?</span>
      )}
      <span>
        <strong>{name}</strong>
        {node.is_baby && <small>Baby</small>}
      </span>
    </Link>
  );
}

function EvolutionRequirement({
  node,
  fromSpeciesSlug,
  versionGroups,
}: {
  node: EvolutionChainLink;
  fromSpeciesSlug: string;
  versionGroups: string[];
}) {
  const groups = groupEvolutionRequirements(node.evolution_details, node.species.name, { versionGroups, fromSpeciesSlug });

  return (
    <div className="evolution-requirement" aria-label="Evolution requirement">
      <span className="evolution-requirement__arrow" aria-hidden="true">→</span>
      <div className="evolution-requirement__content">
        {groups.length > 1 && <small className="evolution-requirement__label">Any of these</small>}
        {groups.map((group) => (
          <div className="evolution-requirement__method" key={`${group.summary}-${group.versions.join('-')}`}>
            <strong>{group.summary}</strong>
            {group.versions.length > 0 && (
              <small>{group.versions.map(humanizeApiName).join(' · ')}</small>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvolutionBranch({
  node,
  currentSpeciesSlug,
  versionGroups,
  queryString,
}: {
  node: EvolutionChainLink;
  currentSpeciesSlug: string;
  versionGroups: string[];
  queryString: string;
}) {
  return (
    <div className="evolution-branch">
      <EvolutionNode node={node} currentSpeciesSlug={currentSpeciesSlug} queryString={queryString} />

      {node.evolves_to.length > 0 && (
        <div className="evolution-branch__children">
          {node.evolves_to.map((child) => (
            <div className="evolution-path" key={`${node.species.name}-${child.species.name}`}>
              <EvolutionRequirement node={child} fromSpeciesSlug={node.species.name} versionGroups={versionGroups} />
              <EvolutionBranch
                node={child}
                currentSpeciesSlug={currentSpeciesSlug}
                versionGroups={versionGroups}
                queryString={queryString}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EvolutionChain({
  chain,
  currentSpeciesSlug,
  versionGroups,
  contextLabel,
  queryString,
}: {
  chain: EvolutionChainDetail;
  currentSpeciesSlug: string;
  versionGroups: string[];
  contextLabel: string;
  queryString: string;
}) {
  return (
    <section className="panel pokemon-section pokemon-evolution" id="evolution" aria-labelledby="evolution-title">
      <div className="pokemon-section__head">
        <h2 id="evolution-title">Evolution</h2>
        <span className="pokemon-section__context">{contextLabel}</span>
      </div>

      {chain.baby_trigger_item && (
        <div className="evolution-baby-note">
          <strong>Breeding</strong>
          <span>To hatch the baby, a parent must hold {humanizeApiName(chain.baby_trigger_item.name)}.</span>
        </div>
      )}

      <div className="evolution-tree" role="group" aria-label="Evolution chain">
        <EvolutionBranch
          node={chain.chain}
          currentSpeciesSlug={currentSpeciesSlug}
          versionGroups={versionGroups}
          queryString={queryString}
        />
      </div>
    </section>
  );
}
