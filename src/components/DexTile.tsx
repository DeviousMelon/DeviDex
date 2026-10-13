import { Link } from 'react-router-dom';
import { PokemonSprite } from './PokemonSprite';

export type DexTileState = 'missing' | 'owned' | 'shiny';

type DexTileProps = {
  dexNumber: number;
  dexNumberWidth?: number;
  nationalDexNumber: number;
  name: string;
  /** Only shown when it adds something (form type, regional Dex name). */
  subtitle?: string;
  state: DexTileState;
  disabled?: boolean;
  forceShinyPreview?: boolean;
  representationSlot?: boolean;
  spriteUrl?: string | null;
  shinySpriteUrl?: string | null;
  badges?: string[];
  detailsHref?: string;
  onCycle?: () => void;
};

const formatDexNumber = (number: number, width: number) => `#${number.toString().padStart(width, '0')}`;

/**
 * One collection slot, for both the National Dex and individual games.
 * Click cycles missing → owned → shiny → missing. Missing slots show a faded
 * sprite, so gaps stand out at a glance.
 *
 * Battle-only forms say "Represented" rather than "Owned", so DeviDex never
 * implies a Mega can literally sit in a storage box.
 */
export function DexTile({
  dexNumber,
  dexNumberWidth = 4,
  nationalDexNumber,
  name,
  subtitle,
  state,
  disabled = false,
  forceShinyPreview = false,
  representationSlot = false,
  spriteUrl = null,
  shinySpriteUrl = null,
  badges = [],
  detailsHref,
  onCycle,
}: DexTileProps) {
  const showShiny = state === 'shiny' || forceShinyPreview;
  const stateLabel = representationSlot
    ? state === 'shiny' ? 'Shiny represented' : state === 'owned' ? 'Represented' : 'Not represented'
    : state === 'shiny' ? 'Shiny' : state === 'owned' ? 'Owned' : 'Missing';
  const next = state === 'missing' ? 'owned' : state === 'owned' ? 'shiny' : 'missing';

  return (
    <div className={`tile tile--${state}${representationSlot ? ' tile--stand-in' : ''}`}>
      <button
        className="tile__button"
        type="button"
        disabled={disabled}
        onClick={onCycle}
        aria-label={`${name}, ${formatDexNumber(dexNumber, dexNumberWidth)}: ${stateLabel}. Activate to mark ${next}.`}
      >
        <span className="tile__number">{formatDexNumber(dexNumber, dexNumberWidth)}</span>
        {state !== 'missing' && (
          <span className={`tile__mark tile__mark--${state}`} aria-hidden="true">{state === 'shiny' ? '✦' : '✓'}</span>
        )}
        <span className="tile__art">
          <PokemonSprite
            className="tile__sprite"
            nationalDexNumber={nationalDexNumber}
            name={name}
            shiny={showShiny}
            spriteUrl={spriteUrl}
            shinySpriteUrl={shinySpriteUrl}
          />
        </span>
        <span className="tile__name" title={name}>{name}</span>
        {(subtitle || representationSlot) && (
          <span className="tile__meta">{representationSlot ? `Stand-in${subtitle ? ` · ${subtitle}` : ''}` : subtitle}</span>
        )}
        {badges.length > 0 && (
          <span className="tile__badges">{badges.map((badge) => <i key={badge}>{badge}</i>)}</span>
        )}
      </button>

      {detailsHref && (
        <Link className="tile__info" to={detailsHref} aria-label={`About ${name}`} title={`About ${name}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.1" /></svg>
        </Link>
      )}
    </div>
  );
}
