import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { GameSelect, PokemonTile, ToolState, TypeBadge } from '../../components/tools/ToolBits';
import { useSearchParamState } from '../../hooks/useFormParam';
import { usePokemonDirectory } from '../../hooks/usePokemonDirectory';
import { useReference } from '../../hooks/useReference';
import { moveLevelLabel } from '../../lib/pokeapi';
import { loadMoves, loadTypeChart, loadVersionGroups, whoLearns } from '../../lib/referenceClient';

const METHODS = [
  { id: '', label: 'Any way' },
  { id: 'level-up', label: 'Level up' },
  { id: 'machine', label: 'TM / TR' },
  { id: 'egg', label: 'Egg' },
  { id: 'tutor', label: 'Tutor' },
];

const MAX_SUGGESTIONS = 24;

export function MovesPage() {
  const [moveSlug, setMoveSlug] = useSearchParamState('move', '');
  const [versionGroup, setVersionGroup] = useSearchParamState('vg', '');
  const [method, setMethod] = useSearchParamState('method', '');
  const [query, setQuery] = useState('');

  const reference = useReference(() => Promise.all([loadMoves(), loadVersionGroups(), loadTypeChart()]), []);
  const { directory, error: directoryError } = usePokemonDirectory();

  const moves = reference.data?.[0] ?? [];
  const move = moves.find((item) => item.slug === moveSlug) ?? null;
  const versionGroupId = reference.data?.[1].find((group) => group.slug === versionGroup)?.id;
  const type = move ? reference.data?.[2].types.find((item) => item.id === move.type_id) : undefined;

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return moves.filter((item) => item.name.toLowerCase().includes(needle)).slice(0, MAX_SUGGESTIONS);
  }, [moves, query]);

  const learners = useReference(
    () => (move ? whoLearns(move.id, versionGroupId, method || undefined) : Promise.resolve([])),
    [move?.id, versionGroupId, method],
  );

  const results = useMemo(() => {
    if (!directory || !learners.data) return [];
    const byPokemon = new Map<number, Set<string>>();
    for (const row of learners.data) {
      const label = moveLevelLabel(row.learn_method, row.level);
      byPokemon.set(row.pokemon_id, (byPokemon.get(row.pokemon_id) ?? new Set()).add(label));
    }
    return [...byPokemon.entries()]
      .flatMap(([id, labels]) => {
        const item = directory.byPokemonId.get(id);
        return item ? [{ item, labels: [...labels].join(' · ') }] : [];
      })
      .sort((a, b) => a.item.dexNumber - b.item.dexNumber || a.item.pokemon.id - b.item.pokemon.id);
  }, [directory, learners.data]);

  return (
    <main className="tools-page">
      <PageHeader
        back={<Link to="/tools">← All tools</Link>}
        title="Move search"
        description="Find every Pokémon that learns a move, in one game or across all of them."
      />

      <section className="panel tool-panel" aria-labelledby="move-search-title">
        <h2 id="move-search-title" className="visually-hidden">Search</h2>
        <div className="tool-field-grid tool-field-grid--wide">
          <label className="tool-field">
            <span>Move</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={move ? move.name : 'Start typing a move name'}
              aria-label="Search moves"
            />
          </label>
          <label className="tool-field">
            <span>Game</span>
            <GameSelect value={versionGroup} onChange={setVersionGroup} allowAny />
          </label>
          <label className="tool-field">
            <span>How</span>
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              {METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>

        {suggestions.length > 0 && (
          <ul className="move-suggestions" aria-label="Matching moves">
            {suggestions.map((item) => (
              <li key={item.id}>
                <button type="button" className={item.slug === moveSlug ? 'is-active' : undefined} onClick={() => { setMoveSlug(item.slug); setQuery(''); }}>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <ToolState loading={reference.loading} error={reference.error ?? directoryError} />
      </section>

      {move && (
        <section className="panel tool-panel" aria-labelledby="move-result-title" aria-live="polite">
          <div className="panel__head">
            <h2 id="move-result-title">{move.name}</h2>
            {!learners.loading && <span className="muted">{results.length.toLocaleString()} Pokémon</span>}
          </div>
          <div className="move-facts">
            {type && <TypeBadge slug={type.slug} name={type.name} />}
            <span>{move.damage_class === 'status' ? 'Status' : move.damage_class === 'physical' ? 'Physical' : 'Special'}</span>
            <span>Power <strong>{move.power ?? '—'}</strong></span>
            <span>Accuracy <strong>{move.accuracy != null ? `${move.accuracy}%` : '—'}</strong></span>
            <span>PP <strong>{move.pp ?? '—'}</strong></span>
            {move.priority !== 0 && <span>Priority <strong>{move.priority > 0 ? `+${move.priority}` : move.priority}</strong></span>}
          </div>
          <ToolState loading={learners.loading} error={learners.error} />
          {!learners.loading && !learners.error && (results.length ? (
            <div className="tool-tiles">
              {results.map(({ item, labels }) => <PokemonTile key={item.pokemon.id} item={item}>{labels}</PokemonTile>)}
            </div>
          ) : <p className="muted">Nobody learns it {versionGroup ? 'in this game' : 'anywhere'}{method ? ' that way' : ''}.</p>)}
        </section>
      )}
    </main>
  );
}
