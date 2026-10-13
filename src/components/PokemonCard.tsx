import { Link } from 'react-router-dom';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import { PokemonSprite } from './PokemonSprite';

/** A shared Pokémon inside a chat message: sprite, name, link to its page. */
export function PokemonCard({ formId, shiny }: { formId: number; shiny: boolean }) {
  const { catalog } = usePokemonCatalog();
  const entry = catalog?.byFormId.get(formId);

  if (!entry) {
    return <div className="chat-pokemon chat-pokemon--loading">{catalog ? 'Pokémon no longer in the Dex' : 'Loading Pokémon…'}</div>;
  }

  return (
    <Link className={`chat-pokemon${shiny ? ' chat-pokemon--shiny' : ''}`} to={`/pokemon/${entry.speciesSlug}`}>
      <PokemonSprite
        nationalDexNumber={entry.dexNumber}
        name={pokemonLabel(entry)}
        shiny={shiny}
        spriteUrl={entry.spriteUrl}
        shinySpriteUrl={entry.shinySpriteUrl}
      />
      <span>
        <small>#{String(entry.dexNumber).padStart(4, '0')}{shiny ? ' · ✦ Shiny' : ''}</small>
        <strong>{pokemonLabel(entry)}</strong>
      </span>
    </Link>
  );
}
