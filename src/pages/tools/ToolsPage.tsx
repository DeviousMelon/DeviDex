import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';

export const TOOLS = [
  {
    to: '/tools/catch',
    title: 'Catch odds',
    mark: '◎',
    body: 'Every ball’s odds for any Pokémon, with HP, status and the game’s own quirks. Gen III to Scarlet/Violet.',
  },
  {
    to: '/tools/breeding',
    title: 'Breeding',
    mark: '◇',
    body: 'Who it can breed with, its egg moves and who can pass them down, plus shiny odds by generation.',
  },
  {
    to: '/tools/types',
    title: 'Type chart & team coverage',
    mark: '▦',
    body: 'The full type chart for any era, and what your team of six is weak to.',
  },
  {
    to: '/tools/damage',
    title: 'Damage calculator',
    mark: '✸',
    body: 'Damage rolls and KO chances between any two Pokémon. The core formula, without abilities or items.',
  },
  {
    to: '/tools/moves',
    title: 'Move search',
    mark: '⌕',
    body: 'Who learns a move, in which game, and how: level, TM, tutor or egg.',
  },
];

export function ToolsPage() {
  return (
    <main className="tools-page">
      <PageHeader
        title="Tools"
        description="Calculators and lookups for planning catches, breeding and battles. Every tool also opens straight from a Pokémon’s page."
      />
      <div className="tools-grid">
        {TOOLS.map((tool) => (
          <Link key={tool.to} to={tool.to} className="tools-card">
            <span className="tools-card__mark" aria-hidden="true">{tool.mark}</span>
            <h2>{tool.title}</h2>
            <p>{tool.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
