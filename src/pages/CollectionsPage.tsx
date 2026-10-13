import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CollectionSetupPanel } from '../components/CollectionSetupPanel';
import { DexBoxes } from '../components/DexBoxes';
import { DexToolbar, type DexFilter } from '../components/DexToolbar';
import { DexTile, type DexTileState } from '../components/DexTile';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useDexCatalog } from '../hooks/useDexCatalog';
import { usePokemonAttributeSearch, type PokemonSearchMode } from '../hooks/usePokemonAttributeSearch';
import { scrollToHashBox, storageOrder } from '../lib/boxes';
import type { DexCatalogEntry, FormCategory } from '../types';

const FORM_LABELS: Record<Exclude<FormCategory, 'default'>, string> = {
  regional: 'Regional form',
  alternate: 'Alternate form',
  pattern: 'Pattern',
  gender: 'Gender difference',
  battle: 'Battle form',
  special: 'Special form',
};

const pad = (n: number) => `#${String(n).padStart(4, '0')}`;
const tileState = (normal: boolean, shiny: boolean): DexTileState => (shiny ? 'shiny' : normal ? 'owned' : 'missing');

export function CollectionsPage() {
  const { user } = useAuth();
  const { goal, collections } = useFormPreferences();
  const { catalog, allCatalog, progress, stats, categoryCounts, loading, error, setCollectionState } = useDexCatalog();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<DexFilter>(searchParams.get('filter') === 'missing' ? 'missing' : 'all');
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<PokemonSearchMode>('pokemon');
  const [saveError, setSaveError] = useState<string | null>(null);
  const attributeSearch = usePokemonAttributeSearch(searchMode, search);

  const ordered = useMemo(() => storageOrder(catalog), [catalog]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ordered.filter((entry) => {
      const row = progress[entry.formId];
      const normal = row?.normalOwned ?? false;
      const shiny = row?.shinyOwned ?? false;
      const matches = !needle
        || (searchMode === 'pokemon'
          ? entry.speciesName.toLowerCase().includes(needle)
            || entry.formName.toLowerCase().includes(needle)
            || entry.formSlug.toLowerCase().includes(needle)
            || String(entry.dexNumber).includes(needle)
          : Boolean(attributeSearch.matches?.has(entry.formSlug) || attributeSearch.matches?.has(entry.speciesSlug)));
      if (!matches) return false;
      if (filter === 'missing') return !normal;
      if (filter === 'owned') return normal;
      if (filter === 'shiny-missing') return !shiny;
      if (filter === 'shiny-owned') return shiny;
      return true;
    });
  }, [attributeSearch.matches, filter, ordered, progress, search, searchMode]);

  // Arriving from a dashboard box (/national-dex#box-4) jumps to that box.
  useEffect(() => {
    if (!loading) scrollToHashBox(location.hash);
  }, [loading, location.hash]);

  const completionByCollection = useMemo(() => Object.fromEntries(collections.map((collection) => {
    const eligible = allCatalog.filter((entry) => entry.formCategory === 'default' || collection.preferences[entry.formCategory]);
    const living = eligible.filter((entry) => progress[entry.formId]?.normalOwned).length;
    const shiny = eligible.filter((entry) => progress[entry.formId]?.shinyOwned).length;
    const current = collection.goal === 'shiny' ? shiny : collection.goal === 'both' ? living + shiny : living;
    const total = collection.goal === 'both' ? eligible.length * 2 : eligible.length;
    return [collection.id, { percent: total ? Math.round((current / total) * 100) : 0, current, total }];
  })), [allCatalog, collections, progress]);

  function chooseFilter(next: DexFilter) {
    setFilter(next);
    setSearchParams(next === 'missing' ? { filter: 'missing' } : {}, { replace: true });
  }

  async function cycle(entry: DexCatalogEntry) {
    setSaveError(null);
    const row = progress[entry.formId];
    const normal = row?.normalOwned ?? false;
    const shiny = row?.shinyOwned ?? false;
    const [nextNormal, nextShiny] = !normal && !shiny ? [true, false] : !shiny ? [true, true] : [false, false];
    const result = await setCollectionState(entry.formId, nextNormal, nextShiny);
    if (result.error) setSaveError(result.error);
  }

  const boxed = filter === 'all' && !search.trim();
  const shinyMode = filter === 'shiny-missing' || filter === 'shiny-owned';
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <main className="dex-page">
      <PageHeader
        title="National Dex"
        description="Click a Pokémon to mark it owned, again for shiny, and once more to clear it."
        aside={(
          <div className="stat-inline">
            <div><strong>{stats.livingOwned.toLocaleString()}<small>/{stats.total.toLocaleString()}</small></strong><span>owned · {pct(stats.livingOwned)}%</span></div>
            <div className="is-shiny"><strong>{stats.shinyOwned.toLocaleString()}</strong><span>shiny · {pct(stats.shinyOwned)}%</span></div>
          </div>
        )}
      />

      {!user && (
        <p className="guest-note">
          You're trying DeviDex as a guest. Your ticks disappear when you close the tab. <Link to="/login">Sign in to save them</Link>.
        </p>
      )}

      <CollectionSetupPanel categoryCounts={categoryCounts} completionByCollection={completionByCollection} />

      <DexToolbar
        search={search}
        onSearch={setSearch}
        searchMode={searchMode}
        onSearchMode={setSearchMode}
        filter={filter}
        onFilter={chooseFilter}
        resultText={searchMode !== 'pokemon' && search.trim()
          ? attributeSearch.loading
            ? 'Checking…'
            : attributeSearch.error ?? `${visible.length.toLocaleString()} match`
          : boxed ? undefined : `${visible.length.toLocaleString()} shown`}
        resultIsError={Boolean(attributeSearch.error)}
      />

      {saveError && <p className="form-message form-message--error" role="alert">That change wasn't saved: {saveError}</p>}

      {loading ? (
        <p className="dex-status">Loading the Pokédex…</p>
      ) : error ? (
        <div className="dex-status dex-status--error"><strong>The Pokédex couldn't be loaded.</strong> <span>{error}</span></div>
      ) : catalog.length === 0 ? (
        <div className="dex-status">
          <strong>No Pokémon have been imported yet.</strong>
          {user && <span> An admin can import them from the <Link to="/admin">Admin page</Link>.</span>}
        </div>
      ) : visible.length === 0 ? (
        <div className="dex-status">
          <strong>Nothing matches.</strong> <button className="text-button" type="button" onClick={() => { setSearch(''); chooseFilter('all'); }}>Clear search and filters</button>
        </div>
      ) : (
        <DexBoxes
          items={visible}
          boxed={boxed}
          label="National Dex"
          itemKey={(entry) => entry.formId}
          isOwned={(entry) => Boolean(goal === 'shiny' ? progress[entry.formId]?.shinyOwned : progress[entry.formId]?.normalOwned)}
          boxRange={(box) => `${pad(box[0].dexNumber)}–${pad(box[box.length - 1].dexNumber)}`}
          renderItem={(entry) => {
            const row = progress[entry.formId];
            return (
              <DexTile
                dexNumber={entry.dexNumber}
                nationalDexNumber={entry.dexNumber}
                name={entry.isDefault ? entry.speciesName : `${entry.speciesName} · ${entry.formName}`}
                subtitle={entry.isDefault ? undefined : entry.formCategory === 'default' ? undefined : FORM_LABELS[entry.formCategory]}
                state={tileState(row?.normalOwned ?? false, row?.shinyOwned ?? false)}
                forceShinyPreview={shinyMode}
                representationSlot={entry.supportsPlaceholder || entry.isBattleOnly}
                spriteUrl={entry.spriteUrl}
                shinySpriteUrl={entry.shinySpriteUrl}
                detailsHref={`/pokemon/${entry.speciesSlug}${entry.isDefault ? '' : `?form=${encodeURIComponent(entry.formSlug)}`}`}
                onCycle={() => void cycle(entry)}
              />
            );
          }}
        />
      )}
    </main>
  );
}
