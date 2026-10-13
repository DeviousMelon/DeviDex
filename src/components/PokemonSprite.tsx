import { useEffect, useMemo, useState } from 'react';
import { pokemonSpriteUrl } from '../lib/sprites';

type PokemonSpriteProps = {
  nationalDexNumber: number;
  name: string;
  shiny?: boolean;
  className?: string;
  spriteUrl?: string | null;
  shinySpriteUrl?: string | null;
};

/**
 * Shared sprite component.
 *
 * Default species use the National Dex sprite path. Imported alternate forms
 * can provide exact sprite URLs from PokéAPI, which matters for things like
 * Vivillon patterns where a plain National Dex number would show the wrong
 * appearance.
 */
export function PokemonSprite({
  nationalDexNumber,
  name,
  shiny = false,
  className = '',
  spriteUrl = null,
  shinySpriteUrl = null,
}: PokemonSpriteProps) {
  const [failed, setFailed] = useState(false);

  const src = useMemo(() => {
    if (shiny && shinySpriteUrl) return shinySpriteUrl;
    if (!shiny && spriteUrl) return spriteUrl;
    return pokemonSpriteUrl(nationalDexNumber, shiny);
  }, [nationalDexNumber, shiny, shinySpriteUrl, spriteUrl]);

  // A failed normal sprite should not permanently poison a later shiny/form
  // URL after the user changes collection state.
  useEffect(() => setFailed(false), [src]);

  if (failed) {
    return (
      <span className={`pokemon-sprite-failed ${className}`} role="img" aria-label={`${name} sprite unavailable`}>
        ?
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={`${name}${shiny ? ' shiny' : ''} sprite`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
