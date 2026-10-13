import type { PokemonPreview, ProgressCardData } from '../types';

// Temporary demo data for the homepage.
// In the real app, this will eventually come from your Living Dex database.
export const progressCards: ProgressCardData[] = [
  {
    label: 'National Living Dex',
    current: 812,
    total: 1025,
    detail: '213 species remaining',
    tone: 'blue',
  },
  {
    label: 'Shiny Living Dex',
    current: 286,
    total: 1025,
    detail: '27.9% complete',
    tone: 'gold',
  },
  {
    label: 'Form Dex',
    current: 341,
    total: 418,
    detail: '77 forms remaining',
    tone: 'orange',
  },
];

// Public homepage examples. DashboardPage renders their PokéAPI sprites and
// swaps to shiny artwork where the demo status is shiny.
export const recentPokemon: PokemonPreview[] = [
  { dexNumber: 1, name: 'Bulbasaur', status: 'owned' },
  { dexNumber: 2, name: 'Ivysaur', status: 'owned' },
  { dexNumber: 3, name: 'Venusaur', status: 'shiny' },
  { dexNumber: 4, name: 'Charmander', status: 'owned' },
  { dexNumber: 5, name: 'Charmeleon', status: 'missing' },
  { dexNumber: 6, name: 'Charizard', status: 'missing' },
  { dexNumber: 7, name: 'Squirtle', status: 'owned' },
  { dexNumber: 8, name: 'Wartortle', status: 'shiny' },
  { dexNumber: 9, name: 'Blastoise', status: 'owned' },
  { dexNumber: 10, name: 'Caterpie', status: 'owned' },
  { dexNumber: 11, name: 'Metapod', status: 'missing' },
  { dexNumber: 12, name: 'Butterfree', status: 'owned' },
];
