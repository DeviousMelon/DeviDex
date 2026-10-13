// PokéAPI identifiers are excellent database keys but are not always pretty
// display names. This helper covers the awkward species names and gives a
// sensible title-cased fallback for everything else.
const specialNames: Record<string, string> = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'farfetchd': "Farfetch'd",
  'sirfetchd': "Sirfetch'd",
  'mr-mime': 'Mr. Mime',
  'mime-jr': 'Mime Jr.',
  'mr-rime': 'Mr. Rime',
  'type-null': 'Type: Null',
  'flabebe': 'Flabébé',
  'porygon-z': 'Porygon-Z',
  'ho-oh': 'Ho-Oh',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
};

export function formatPokemonName(slug: string) {
  if (specialNames[slug]) return specialNames[slug];

  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// National Dex ranges are stable and let the initial importer assign a
// generation without making 1,000+ extra network requests.
export function generationForDexNumber(number: number) {
  if (number <= 151) return 1;
  if (number <= 251) return 2;
  if (number <= 386) return 3;
  if (number <= 493) return 4;
  if (number <= 649) return 5;
  if (number <= 721) return 6;
  if (number <= 809) return 7;
  if (number <= 905) return 8;
  return 9;
}
