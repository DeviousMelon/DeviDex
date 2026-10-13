import { Link } from 'react-router-dom';
import { PokemonSprite } from './PokemonSprite';

export type DexTileState = 'missing' | 'owned' | 'shiny';

type DexTileProps = {
  dexNumber: number;
  dexNumberWidth?: number;
  nationalDexNumber: number;
  name: string;
  subtitle: string;
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
 * One reusable collection tile for both the National Dex and individual games.
 *
 * Battle-only forms use the same saved booleans, but their language says
 * "Represented" rather than "Owned" so DeviDex never implies a Mega/G-Max/etc.
 * can literally sit in a storage box.
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
    ? state === 'shiny' ? 'Shiny represented' : state === 'owned' ? 'Represented' : 'Unrepresented'
    : state === 'shiny' ? 'Shiny' : state === 'owned' ? 'Owned' : 'Missing';

  return (
    <div className="dex-card-shell">
      <button
        className={`dex-card dex-card--${state}${representationSlot ? ' dex-card--representation' : ''}`}
        type="button"
        disabled={disabled}
        onClick={onCycle}
        aria-label={`${name}: ${stateLabel}. Click to cycle collection status.`}
        title={`${name} — ${stateLabel}. Click to cycle.`}
      >
        <div className="dex-card__visual">
          <span className="dex-card__number">{formatDexNumber(dexNumber, dexNumberWidth)}</span>

          <PokemonSprite
            className="dex-card__sprite"
            nationalDexNumber={nationalDexNumber}
            name={name}
            shiny={showShiny}
            spriteUrl={spriteUrl}
            shinySpriteUrl={shinySpriteUrl}
          />

          {state === 'shiny' && (
            <span className="dex-card__shiny-mark" aria-hidden="true">✦</span>
          )}

          {representationSlot && (
            <span className="dex-card__representation-mark" aria-hidden="true">R</span>
          )}
        </div>

        <div className="dex-card__identity">
          <strong title={name}>{name}</strong>
          <span>{subtitle}</span>
          {badges.length > 0 && (
            <span className="dex-card__badges">
              {badges.map((badge) => <i key={badge}>{badge}</i>)}
            </span>
          )}
        </div>

        <div className={`dex-card__status dex-card__status--${state}`}>
          <span aria-hidden="true">{state === 'shiny' ? '✦' : state === 'owned' ? '✓' : '○'}</span>
          <span>{stateLabel}</span>
        </div>
      </button>

      {detailsHref && (
        <Link
          className="dex-card__details-link"
          to={detailsHref}
          aria-label={`View ${name} information`}
          title={`View ${name} information`}
        >
          i
        </Link>
      )}
    </div>
  );
}
