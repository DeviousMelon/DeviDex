/**
 * Returns the default-form sprite URL for a National Dex number.
 *
 * Alternate forms can provide explicit URLs imported from PokéAPI. This
 * fallback remains useful for every ordinary species and for old catalogue
 * rows created before the form importer existed.
 */
export function pokemonSpriteUrl(nationalDexNumber: number, shiny = false) {
  const folder = shiny ? 'shiny/' : '';
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${folder}${nationalDexNumber}.png`;
}
