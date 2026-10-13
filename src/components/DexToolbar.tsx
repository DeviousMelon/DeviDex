import type { PokemonSearchMode } from '../hooks/usePokemonAttributeSearch';

export type DexFilter = 'all' | 'missing' | 'owned' | 'shiny-missing' | 'shiny-owned';

const FILTERS: Array<{ value: DexFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Missing' },
  { value: 'owned', label: 'Owned' },
  { value: 'shiny-missing', label: 'Shiny missing' },
  { value: 'shiny-owned', label: 'Shiny owned' },
];

type DexToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  /** Omit on pages without type/move search. */
  searchMode?: PokemonSearchMode;
  onSearchMode?: (mode: PokemonSearchMode) => void;
  filter: DexFilter;
  onFilter: (filter: DexFilter) => void;
  resultText?: string;
  resultIsError?: boolean;
  placeholder?: string;
};

/** Search + filters, pinned under the top bar while scrolling a Dex. */
export function DexToolbar({ search, onSearch, searchMode, onSearchMode, filter, onFilter, resultText, resultIsError, placeholder }: DexToolbarProps) {
  const searchPlaceholder = placeholder
    ?? (searchMode === 'type' ? 'Type, e.g. Dragon' : searchMode === 'move' ? 'Move, e.g. Surf' : 'Search name or number');

  return (
    <div className="dex-toolbar" role="search">
      <div className="dex-toolbar__search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" /></svg>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search this Dex"
        />
        {searchMode && onSearchMode && (
          <select value={searchMode} onChange={(event) => onSearchMode(event.target.value as PokemonSearchMode)} aria-label="Search by">
            <option value="pokemon">Name</option>
            <option value="type">Type</option>
            <option value="move">Move</option>
          </select>
        )}
      </div>

      <div className="segmented dex-toolbar__filters" role="group" aria-label="Show">
        {FILTERS.map((option) => (
          <button key={option.value} type="button" className={filter === option.value ? 'is-active' : undefined} aria-pressed={filter === option.value} onClick={() => onFilter(option.value)}>
            {option.label}
          </button>
        ))}
      </div>

      {resultText && <span className={`dex-toolbar__result${resultIsError ? ' is-error' : ''}`} aria-live="polite">{resultText}</span>}
    </div>
  );
}
