import {
  GENERATIONS,
  familiesForGeneration,
  gameFamilyById,
  generationRoman,
  normalizePokemonGameContext,
  type PokemonGameContext,
} from '../lib/gameContext';

type Props = {
  context: PokemonGameContext;
  speciesGeneration: number;
  onChange: (next: PokemonGameContext) => void;
};

/** One compact bar: which game the stats, moves and evolutions come from. */
export function PokemonGameContextSelector({ context, speciesGeneration, onChange }: Props) {
  const family = gameFamilyById(context.familyId) ?? familiesForGeneration(context.generation)[0];

  function chooseGame(value: string) {
    const [familyId, versionGroup] = value.split('|');
    const nextFamily = gameFamilyById(familyId);
    if (!nextFamily) return;
    const keepVersion = nextFamily.id === family.id && nextFamily.versions.some((item) => item.slug === context.version);
    onChange(normalizePokemonGameContext({
      generation: nextFamily.generation,
      familyId: nextFamily.id,
      versionGroup,
      version: keepVersion ? context.version : nextFamily.versions[0].slug,
    }));
  }

  return (
    <div className="game-bar">
      <label className="game-bar__field">
        <span>Game</span>
        <select value={`${family.id}|${context.versionGroup}`} onChange={(event) => chooseGame(event.target.value)}>
          {GENERATIONS.filter((generation) => generation >= speciesGeneration).map((generation) => (
            <optgroup key={generation} label={`Generation ${generationRoman[generation]}`}>
              {familiesForGeneration(generation).flatMap((item) => item.contexts.map((option) => (
                <option key={`${item.id}|${option.versionGroup}`} value={`${item.id}|${option.versionGroup}`}>
                  {option.label}
                </option>
              )))}
            </optgroup>
          ))}
        </select>
      </label>

      {family.versions.length > 1 && (
        <div className="segmented game-bar__versions" role="group" aria-label="Version">
          {family.versions.map((item) => (
            <button
              key={item.slug}
              type="button"
              className={context.version === item.slug ? 'is-active' : undefined}
              aria-pressed={context.version === item.slug}
              onClick={() => onChange({ ...context, version: item.slug })}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <p className="game-bar__hint">Stats, moves, evolutions and the Pokédex entry follow this game.</p>
    </div>
  );
}
