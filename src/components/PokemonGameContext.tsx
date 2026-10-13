import {
  GENERATIONS,
  defaultContextForGeneration,
  familiesForGeneration,
  gameFamilyById,
  generationRoman,
  normalizePokemonGameContext,
  type GenerationNumber,
  type PokemonGameContext,
} from '../lib/gameContext';

type Props = {
  context: PokemonGameContext;
  speciesGeneration: number;
  onChange: (next: PokemonGameContext) => void;
};

export function PokemonGameContextSelector({ context, speciesGeneration, onChange }: Props) {
  const family = gameFamilyById(context.familyId) ?? familiesForGeneration(context.generation)[0];
  const families = familiesForGeneration(context.generation);
  const selectedContext = family.contexts.find((item) => item.versionGroup === context.versionGroup) ?? family.contexts[0];
  const selectedVersion = family.versions.find((item) => item.slug === context.version) ?? family.versions[0];

  function chooseGeneration(generation: GenerationNumber) {
    if (generation < speciesGeneration) return;
    onChange(defaultContextForGeneration(generation));
  }

  function chooseFamily(familyId: string) {
    const nextFamily = families.find((item) => item.id === familyId);
    if (!nextFamily) return;
    onChange(normalizePokemonGameContext({
      generation: nextFamily.generation,
      familyId: nextFamily.id,
      versionGroup: nextFamily.contexts[0].versionGroup,
      version: nextFamily.versions[0].slug,
    }));
  }

  function chooseVersion(version: string) {
    onChange({ ...context, version });
  }

  function chooseVersionGroup(versionGroup: string) {
    onChange({ ...context, versionGroup });
  }

  return (
    <section className="pokemon-game-context" aria-labelledby="pokemon-game-context-title">
      <div className="pokemon-game-context__heading">
        <div>
          <p className="eyebrow">Showing game data</p>
          <h2 id="pokemon-game-context-title">Generation {generationRoman[context.generation]} · {selectedContext.label}</h2>
          <p>
            Exact version: <strong>{selectedVersion.label}</strong>. Moves and evolution rules below follow this context; locations and other game-specific sections will plug into the same selector.
          </p>
        </div>
      </div>

      <div className="pokemon-game-context__row">
        <span className="pokemon-game-context__label">Generation</span>
        <div className="pokemon-game-context__tabs pokemon-game-context__tabs--generation" role="tablist" aria-label="Choose Pokémon generation">
          {GENERATIONS.map((generation) => {
            const unavailable = generation < speciesGeneration;
            return (
              <button
                key={generation}
                type="button"
                role="tab"
                aria-selected={context.generation === generation}
                className={context.generation === generation ? 'is-active' : ''}
                disabled={unavailable}
                title={unavailable ? `This species did not exist in Generation ${generationRoman[generation]}.` : `Generation ${generationRoman[generation]}`}
                onClick={() => chooseGeneration(generation)}
              >
                {generationRoman[generation]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pokemon-game-context__row">
        <span className="pokemon-game-context__label">Game</span>
        <div className="pokemon-game-context__tabs" role="tablist" aria-label={`Choose Generation ${generationRoman[context.generation]} game`}>
          {families.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={family.id === item.id}
              className={family.id === item.id ? 'is-active' : ''}
              onClick={() => chooseFamily(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {family.versions.length > 1 && (
        <div className="pokemon-game-context__row">
          <span className="pokemon-game-context__label">Version</span>
          <div className="pokemon-game-context__tabs pokemon-game-context__tabs--version" role="tablist" aria-label="Choose exact game version">
            {family.versions.map((item) => (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={context.version === item.slug}
                className={context.version === item.slug ? 'is-active' : ''}
                onClick={() => chooseVersion(item.slug)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {family.contexts.length > 1 && (
        <div className="pokemon-game-context__row">
          <span className="pokemon-game-context__label">Content</span>
          <div className="pokemon-game-context__tabs pokemon-game-context__tabs--content" role="tablist" aria-label="Choose base game or expansion">
            {family.contexts.map((item) => (
              <button
                key={item.versionGroup}
                type="button"
                role="tab"
                aria-selected={context.versionGroup === item.versionGroup}
                className={context.versionGroup === item.versionGroup ? 'is-active' : ''}
                onClick={() => chooseVersionGroup(item.versionGroup)}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
