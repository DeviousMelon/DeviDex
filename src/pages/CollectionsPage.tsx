import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CollectionSetupPanel } from '../components/CollectionSetupPanel';
import { DexTile, type DexTileState } from '../components/DexTile';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useDexCatalog } from '../hooks/useDexCatalog';
import { usePokemonAttributeSearch, type PokemonSearchMode } from '../hooks/usePokemonAttributeSearch';
import type { FormCategory, FormPreferences } from '../types';

type CollectionFilter = 'all' | 'missing' | 'owned' | 'shiny-missing' | 'shiny-owned';

type OptionalCategory = Exclude<FormCategory, 'default'>;

const filterLabels: Record<CollectionFilter, string> = {
  all: 'All',
  missing: 'Missing',
  owned: 'Owned',
  'shiny-missing': 'Shiny missing',
  'shiny-owned': 'Shiny owned',
};

const categoryCopy: Record<OptionalCategory, { label: string; description: string }> = {
  regional: {
    label: 'Regional forms',
    description: 'Alolan, Galarian, Hisuian, Paldean and similar regional variants.',
  },
  alternate: {
    label: 'Alternate forms',
    description: 'Non-default forms that are not regional, pattern, gender or battle-only.',
  },
  pattern: {
    label: 'Patterns & sets',
    description: 'Collections such as Vivillon patterns and Unown letters.',
  },
  gender: {
    label: 'Gender differences',
    description: 'Extra female appearance slots for species with visible gender differences.',
  },
  battle: {
    label: 'Battle-only stand-ins',
    description: 'Mega, battle-only and similar forms tracked as representation slots.',
  },
  special: {
    label: 'Special / cosmetic',
    description: 'Costume, cap, Totem and other special presentation forms.',
  },
};

const optionalCategories = Object.keys(categoryCopy) as OptionalCategory[];

function stateFromProgress(normalOwned: boolean, shinyOwned: boolean): DexTileState {
  if (shinyOwned) return 'shiny';
  if (normalOwned) return 'owned';
  return 'missing';
}

function categoryLabel(category: FormCategory) {
  if (category === 'default') return 'Base species';
  return categoryCopy[category].label;
}

export function CollectionsPage() {
  const { user } = useAuth();
  const {
    preferences,
    goal,
    collections,
    activeCollection,
    loading: preferencesLoading,
    saving: preferencesSaving,
    saveError: preferenceError,
    setPreference,
    resetPreferences,
  } = useFormPreferences();
  const {
    catalog,
    allCatalog,
    progress,
    stats,
    categoryCounts,
    loading,
    error,
    setCollectionState,
  } = useDexCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter');
  const [filter, setFilter] = useState<CollectionFilter>(
    initialFilter === 'missing' ? 'missing' : 'all',
  );
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<PokemonSearchMode>('pokemon');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formsOpen, setFormsOpen] = useState(false);
  const attributeSearch = usePokemonAttributeSearch(searchMode, search);

  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return catalog.filter((entry) => {
      const row = progress[entry.formId];
      const normalOwned = row?.normalOwned ?? false;
      const shinyOwned = row?.shinyOwned ?? false;

      const matchesSearch = !needle
        || (searchMode === 'pokemon'
          ? entry.speciesName.toLowerCase().includes(needle)
            || entry.formName.toLowerCase().includes(needle)
            || entry.formSlug.toLowerCase().includes(needle)
            || entry.dexNumber.toString().includes(needle)
          : Boolean(attributeSearch.matches?.has(entry.formSlug) || attributeSearch.matches?.has(entry.speciesSlug)));

      if (!matchesSearch) return false;

      switch (filter) {
        case 'missing':
          return !normalOwned;
        case 'owned':
          return normalOwned;
        case 'shiny-missing':
          return !shinyOwned;
        case 'shiny-owned':
          return shinyOwned;
        default:
          return true;
      }
    });
  }, [attributeSearch.matches, catalog, filter, progress, search, searchMode]);

  function chooseFilter(next: CollectionFilter) {
    setFilter(next);
    if (next === 'missing') setSearchParams({ filter: 'missing' });
    else setSearchParams({});
  }

  async function cycleEntry(formId: number, normalOwned: boolean, shinyOwned: boolean) {
    setSaveError(null);

    let nextNormal = false;
    let nextShiny = false;

    if (!normalOwned && !shinyOwned) {
      nextNormal = true;
    } else if (!shinyOwned) {
      nextNormal = true;
      nextShiny = true;
    }

    const result = await setCollectionState(formId, nextNormal, nextShiny);
    if (result.error) setSaveError(result.error);
  }

  async function toggleCategory(category: OptionalCategory) {
    await setPreference(category as keyof FormPreferences, !preferences[category]);
  }

  const livingPercent = stats.total
    ? Math.round((stats.livingOwned / stats.total) * 100)
    : 0;
  const shinyPercent = stats.total
    ? Math.round((stats.shinyOwned / stats.total) * 100)
    : 0;

  const completionByCollection = useMemo(() => Object.fromEntries(collections.map((collection) => {
    const eligible = allCatalog.filter((entry) =>
      entry.formCategory === 'default' || collection.preferences[entry.formCategory],
    );
    const livingOwned = eligible.filter((entry) => progress[entry.formId]?.normalOwned).length;
    const shinyOwned = eligible.filter((entry) => progress[entry.formId]?.shinyOwned).length;
    const current = collection.goal === 'shiny'
      ? shinyOwned
      : collection.goal === 'both'
        ? livingOwned + shinyOwned
        : livingOwned;
    const total = collection.goal === 'both' ? eligible.length * 2 : eligible.length;
    return [collection.id, {
      percent: total ? Math.round((current / total) * 100) : 0,
      current,
      total,
    }];
  })), [allCatalog, collections, progress]);

  const enabledExtraCategories = optionalCategories.filter((category) => preferences[category]).length;

  const goalOwned = goal === 'shiny'
    ? stats.shinyOwned
    : goal === 'both'
      ? stats.livingOwned + stats.shinyOwned
      : stats.livingOwned;
  const goalTotal = goal === 'both' ? stats.total * 2 : stats.total;
  const goalPercent = goalTotal ? Math.round((goalOwned / goalTotal) * 100) : 0;

  return (
    <main className="collection-page">
      <section className="collection-hero">
        <div>
          <p className="eyebrow">NATIONAL DEX</p>
          <h1>Your National Living Dex, defined your way.</h1>
          <p>
            Base species are always included. Turn form categories on when they count for your
            collection, then click each tile once for regular and again for shiny.
          </p>
        </div>

        <div className="collection-summary collection-summary--phase5" aria-label="Living Dex summary">
          <div>
            <span>Living Dex</span>
            <strong>{stats.livingOwned} / {stats.total}</strong>
            <small>{livingPercent}% complete</small>
          </div>
          <div>
            <span>Shiny Dex</span>
            <strong>{stats.shinyOwned} / {stats.total}</strong>
            <small>{shinyPercent}% complete</small>
          </div>
          <div className="collection-summary__goal">
            <span>{activeCollection?.name ?? 'Current setup'}</span>
            <strong>{goalPercent}%</strong>
            <small>{goal === 'both' ? 'Living + shiny goal' : goal === 'shiny' ? 'Shiny goal' : 'Living goal'}</small>
          </div>
        </div>
      </section>

      <div className="collection-cycle-key" aria-label="Collection click cycle">
        <span><i className="cycle-dot cycle-dot--missing" /> Missing</span>
        <span aria-hidden="true">→</span>
        <span><i className="cycle-dot cycle-dot--owned" /> Owned</span>
        <span aria-hidden="true">→</span>
        <span><i className="cycle-dot cycle-dot--shiny" /> Shiny</span>
        <span aria-hidden="true">→ click again to reset</span>
      </div>

      {!user && (
        <section className="collection-signin-banner">
          <div>
            <strong>Guest mode: progress and form rules are temporary.</strong>
            <p>Refreshing or closing DeviDex clears them. Sign in to save and sync your setup.</p>
          </div>
          <Link className="button button--primary" to="/login">Sign in</Link>
        </section>
      )}


      <CollectionSetupPanel completionByCollection={completionByCollection} />

      <section className="form-rules-panel" aria-labelledby="form-rules-title">
        <div className="form-rules-panel__header">
          <div>
            <p className="eyebrow">FORM RULES</p>
            <h2 id="form-rules-title">What counts in this Dex?</h2>
            <p>
              Presets above set sensible defaults. These switches are the detailed rules underneath,
              and changing them turns the current setup into Custom without touching saved progress.
            </p>
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setFormsOpen((current) => !current)}
            aria-expanded={formsOpen}
          >
            {formsOpen ? 'Hide form settings' : `Choose forms${enabledExtraCategories ? ` · ${enabledExtraCategories} on` : ''}`}
          </button>
        </div>

        {formsOpen && (
          <div className="form-rules-panel__body">
            <div className="form-rule-grid">
              {optionalCategories.map((category) => {
                const copy = categoryCopy[category];
                const count = categoryCounts[category] ?? 0;
                const enabled = preferences[category];

                return (
                  <label className={`form-rule-card${enabled ? ' is-enabled' : ''}`} key={category}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={preferencesLoading || preferencesSaving || count === 0}
                      onChange={() => void toggleCategory(category)}
                    />
                    <span className="form-rule-card__copy">
                      <strong>{copy.label}</strong>
                      <span>{copy.description}</span>
                    </span>
                    <span className="form-rule-card__count">{count.toLocaleString()}</span>
                  </label>
                );
              })}
            </div>

            <div className="form-rules-panel__footer">
              <p>
                {user
                  ? 'These choices are saved to your DeviDex account.'
                  : 'Guest form choices last only until this page is refreshed.'}
              </p>
              <button className="button button--secondary" type="button" disabled={preferencesSaving} onClick={() => void resetPreferences()}>
                Base species only
              </button>
            </div>

            {preferenceError && <p className="collection-error">Could not save form rules: {preferenceError}</p>}
          </div>
        )}
      </section>

      {saveError && <p className="collection-error">Could not save that change: {saveError}</p>}

      <section className="collection-toolbar" aria-label="Dex filters">
        <div className="dex-search-cluster">
          <label className="collection-search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchMode === 'pokemon' ? 'Name, form or Dex number' : searchMode === 'type' ? 'e.g. Dragon' : 'e.g. Surf or Ice Beam'}
            />
          </label>
          <label className="dex-search-mode">
            <span>Search by</span>
            <select value={searchMode} onChange={(event) => setSearchMode(event.target.value as PokemonSearchMode)}>
              <option value="pokemon">Pokémon / form</option>
              <option value="type">Type</option>
              <option value="move">Move compatibility (any game)</option>
            </select>
          </label>
          {searchMode !== 'pokemon' && search.trim() && (
            <p className={`dex-attribute-search-state${attributeSearch.error ? ' is-error' : ''}`}>
              {attributeSearch.loading
                ? `Checking ${searchMode === 'type' ? 'type' : 'move'} data…`
                : attributeSearch.error ?? (searchMode === 'type'
                  ? `${visibleEntries.length.toLocaleString()} tracked slots match that type.`
                  : `${visibleEntries.length.toLocaleString()} tracked slots have been able to learn that move in at least one game.`)}
            </p>
          )}
        </div>

        <div className="filter-pills">
          {(Object.keys(filterLabels) as CollectionFilter[]).map((key) => (
            <button
              className={filter === key ? 'is-active' : ''}
              key={key}
              type="button"
              onClick={() => chooseFilter(key)}
            >
              {filterLabels[key]}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className="dex-empty-state">
          <div className="loading-mark">✓</div>
          <strong>Loading the Dex…</strong>
        </section>
      ) : error ? (
        <section className="dex-empty-state dex-empty-state--error">
          <strong>The Living Dex database is not ready yet.</strong>
          <p>{error}</p>
        </section>
      ) : catalog.length === 0 ? (
        <section className="dex-empty-state">
          <strong>No trackable Pokémon have been imported yet.</strong>
          <p>Your admin account can open the Admin page and run the National Dex importer once.</p>
          {user && <Link className="button button--secondary" to="/admin">Open Admin</Link>}
        </section>
      ) : (
        <>
          <div className="collection-result-line">
            <span>{visibleEntries.length.toLocaleString()} entries shown</span>
            <span>{stats.alternateForms.toLocaleString()} optional forms currently included</span>
            {stats.availableAlternateForms > 0 && (
              <span>{stats.availableAlternateForms.toLocaleString()} optional form slots available</span>
            )}
          </div>

          <section className="dex-card-grid" aria-label="National Living Dex">
            {visibleEntries.map((entry) => {
              const row = progress[entry.formId];
              const normalOwned = row?.normalOwned ?? false;
              const shinyOwned = row?.shinyOwned ?? false;
              const displayName = entry.isDefault
                ? entry.speciesName
                : `${entry.speciesName} · ${entry.formName}`;
              const formSubtitle = entry.isDefault
                ? `Gen ${entry.generation}`
                : `Gen ${entry.generation} · ${categoryLabel(entry.formCategory)}${entry.isBattleOnly ? ' · stand-in' : ''}`;

              return (
                <DexTile
                  key={entry.formId}
                  dexNumber={entry.dexNumber}
                  nationalDexNumber={entry.dexNumber}
                  name={displayName}
                  subtitle={formSubtitle}
                  state={stateFromProgress(normalOwned, shinyOwned)}
                  forceShinyPreview={filter === 'shiny-missing' || filter === 'shiny-owned'}
                  representationSlot={entry.supportsPlaceholder || entry.isBattleOnly}
                  spriteUrl={entry.spriteUrl}
                  shinySpriteUrl={entry.shinySpriteUrl}
                  detailsHref={`/pokemon/${entry.speciesSlug}${entry.isDefault ? '' : `?form=${encodeURIComponent(entry.formSlug)}`}`}
                  onCycle={() => void cycleEntry(entry.formId, normalOwned, shinyOwned)}
                />
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
