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
        {node.is_baby && <small>Baby Pokémon</small>}
        {isCurrent && <small>Current species</small>}
      </span>
    </Link>
  );
}

function EvolutionRequirement({
  node,
  versionGroups,
}: {
  node: EvolutionChainLink;
  versionGroups: string[];
}) {
  const groups = groupEvolutionRequirements(node.evolution_details, node.species.name, versionGroups);
  const hasMultipleMethods = groups.length > 1;

  return (
    <div className="evolution-requirement" aria-label="Evolution requirement">
      <span className="evolution-requirement__arrow" aria-hidden="true">→</span>
      <div className="evolution-requirement__content">
        {hasMultipleMethods && <small className="evolution-requirement__label">Multiple methods in this game context</small>}
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
              <EvolutionRequirement node={child} versionGroups={versionGroups} />
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
    <section className="pokemon-info-card pokemon-evolution-card" id="evolution">
      <div className="pokemon-info-card__heading pokemon-info-card__heading--inline">
        <div>
          <p className="eyebrow">Evolution · {contextLabel}</p>
          <h2>Evolution chain</h2>
        </div>
        <span>Requirements are filtered to the selected game when PokéAPI provides game-specific rules.</span>
      </div>

      {chain.baby_trigger_item && (
        <div className="evolution-baby-note">
          <strong>Baby breeding trigger</strong>
          <span>Historically requires a parent holding {humanizeApiName(chain.baby_trigger_item.name)}.</span>
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

      <p className="evolution-data-note">
        DeviDex keeps unrelated historical evolution methods out of the current game view. Switch generation/game above to inspect how the method changed over time.
      </p>
    </section>
  );
}
