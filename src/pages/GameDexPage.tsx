import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DexTile, type DexTileState } from '../components/DexTile';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useGameDex } from '../hooks/useGameDex';
import { pokemonInfoContextForGameDex } from '../lib/gameContext';
import type { FormCategory, FormPreferences, GameDexCatalogEntry } from '../types';

type Filter = 'all' | 'missing' | 'owned' | 'shiny-missing' | 'shiny-owned';
type OptionalCategory = Exclude<FormCategory, 'default'>;

const labels: Record<Filter, string> = {
  all: 'All',
  missing: 'Missing',
  owned: 'Owned',
  'shiny-missing': 'Shiny missing',
  'shiny-owned': 'Shiny owned',
};

const categoryCopy: Record<OptionalCategory, { label: string; description: string }> = {
  regional: { label: 'Regional forms', description: 'Regional variants supported by this selected game.' },
  alternate: { label: 'Alternate forms', description: 'Persistent non-default forms supported by this selected game.' },
  pattern: { label: 'Patterns & sets', description: 'Pattern/letter collections available in this game ecosystem.' },
  gender: { label: 'Gender differences', description: 'Visible gender-difference slots for supported species.' },
  battle: { label: 'Battle-only stand-ins', description: 'Mega, G-Max and similar forms represented rather than literally stored.' },
  special: { label: 'Special / cosmetic', description: 'Special presentation forms supported by this game.' },
};

const optionalCategories = Object.keys(categoryCopy) as OptionalCategory[];
const tileState = (normalOwned: boolean, shinyOwned: boolean): DexTileState => shinyOwned ? 'shiny' : normalOwned ? 'owned' : 'missing';

function categoryLabel(category: FormCategory) {
  if (category === 'default') return 'Base species';
  return categoryCopy[category].label;
}

export function GameDexPage() {
  const { gameSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    preferences,
    activeCollection,
    loading: preferencesLoading,
    saving: preferencesSaving,
    saveError: preferenceError,
    setPreference,
    resetPreferences,
  } = useFormPreferences();
  const preferredVersion = searchParams.get('version');
  const {
    game,
    versions,
    selectedGame,
    catalog,
    progress,
    stats,
    availableFormCategoryCounts,
    loading,
    error,
    setCollectionState,
  } = useGameDex(gameSlug, preferredVersion);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formsOpen, setFormsOpen] = useState(false);

  const versionById = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog.filter((entry) => {
      const row = progress[entry.progressKey];
      const normal = row?.normalOwned ?? false;
      const shiny = row?.shinyOwned ?? false;
      const matchesSearch = !needle
        || entry.speciesName.toLowerCase().includes(needle)
        || entry.formName?.toLowerCase().includes(needle)
        || entry.formSlug?.toLowerCase().includes(needle)
        || String(entry.dexNumber).includes(needle);
      if (!matchesSearch) return false;
      if (filter === 'missing') return !normal;
      if (filter === 'owned') return normal;
      if (filter === 'shiny-missing') return !shiny;
      if (filter === 'shiny-owned') return shiny;
      return true;
    });
  }, [catalog, filter, progress, search]);

  async function cycle(entry: GameDexCatalogEntry, normalOwned: boolean, shinyOwned: boolean) {
    setSaveError(null);
    let nextNormal = false;
    let nextShiny = false;
    if (!normalOwned && !shinyOwned) nextNormal = true;
    else if (!shinyOwned) { nextNormal = true; nextShiny = true; }
    const result = await setCollectionState(entry, nextNormal, nextShiny);
    if (result.error) setSaveError(result.error);
  }

  async function toggleCategory(category: OptionalCategory) {
    await setPreference(category as keyof FormPreferences, !preferences[category]);
  }

  function chooseVersion(slug: string) {
    const next = new URLSearchParams(searchParams);
    next.set('version', slug);
    setSearchParams(next);
  }

  const livingPercent = stats.total ? Math.round((stats.livingOwned / stats.total) * 100) : 0;
  const shinyPercent = stats.total ? Math.round((stats.shinyOwned / stats.total) * 100) : 0;
  const enabledExtraCategories = optionalCategories.filter((category) => preferences[category]).length;

  return (
    <main className="collection-page">
      <Link className="game-back-link" to="/games">← All Game Dexes</Link>

      {loading ? (
        <section className="dex-empty-state"><strong>Loading shared Game Dex…</strong></section>
      ) : error ? (
        <section className="dex-empty-state dex-empty-state--error"><strong>{error}</strong></section>
      ) : !game || !selectedGame ? null : (
        <>
          <section className="collection-hero game-collection-hero">
            <div>
              <p className="eyebrow">GENERATION {game.generation} · {game.scopeType === 'dlc' ? 'DLC DEX' : 'SHARED GAME DEX'}</p>
              <h1>{game.name}</h1>
              <p>{game.description || 'Track this regional Pokédex in the version you actually play.'}</p>
              {versions.length > 1 && (
                <div className="version-selector" aria-label="Choose tracked game version">
                  <span>Tracking in</span>
                  <div>
                    {versions.map((version) => (
                      <button key={version.id} type="button" className={selectedGame.id === version.id ? 'is-active' : ''} onClick={() => chooseVersion(version.slug)}>
                        {version.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="collection-summary">
              <div><span>{selectedGame.shortLabel} Dex</span><strong>{stats.livingOwned} / {stats.total}</strong><small>{livingPercent}% complete</small></div>
              <div><span>Shiny</span><strong>{stats.shinyOwned} / {stats.total}</strong><small>{shinyPercent}% complete</small></div>
            </div>
          </section>

          {!user && <section className="collection-signin-banner"><div><strong>Guest mode: this {selectedGame.shortLabel} tracker is temporary.</strong><p>Navigation keeps it; refresh/close clears it until you sign in.</p></div><Link className="button button--primary" to="/login">Sign in</Link></section>}
          {saveError && <p className="collection-error">Could not save that change: {saveError}</p>}

          <section className="game-form-rules form-rules-panel" aria-labelledby="game-form-rules-title">
            <div className="form-rules-panel__header">
              <div>
                <p className="eyebrow">GAME FORM RULES</p>
                <h2 id="game-form-rules-title">Forms follow your active collection.</h2>
                <p>
                  {activeCollection ? <><strong>{activeCollection.name}</strong> decides which form categories count. </> : null}
                  DeviDex then shows only forms with game-availability evidence for {selectedGame.shortLabel} and species that belong to this Pokédex.
                </p>
              </div>
              <button className="button button--secondary" type="button" onClick={() => setFormsOpen((current) => !current)} aria-expanded={formsOpen}>
                {formsOpen ? 'Hide form settings' : `Choose forms${enabledExtraCategories ? ` · ${enabledExtraCategories} on` : ''}`}
              </button>
            </div>

            {formsOpen && (
              <div className="form-rules-panel__body">
                <div className="form-rule-grid">
                  {optionalCategories.map((category) => {
                    const count = availableFormCategoryCounts[category] ?? 0;
                    const enabled = preferences[category];
                    const copy = categoryCopy[category];
                    return (
                      <label className={`form-rule-card${enabled ? ' is-enabled' : ''}`} key={category}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={preferencesLoading || preferencesSaving || count === 0}
                          onChange={() => void toggleCategory(category)}
                        />
                        <span className="form-rule-card__copy"><strong>{copy.label}</strong><span>{copy.description}</span></span>
                        <span className="form-rule-card__count">{count.toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="form-rules-panel__footer">
                  <p>Changing these rules changes the active collection everywhere, including the National Dex. Form progress itself is never deleted.</p>
                  <button className="button button--secondary" type="button" disabled={preferencesSaving} onClick={() => void resetPreferences()}>Base species only</button>
                </div>
                {preferenceError && <p className="collection-error">Could not save form rules: {preferenceError}</p>}
              </div>
            )}
          </section>

          <section className="version-exclusive-note">
            <strong>Availability is deliberately evidence-based.</strong>
            <span>Optional forms come from PokéAPI game-index evidence for the selected version. Version-exclusive badges remain positive-only curation; Phase 8 will add exhaustive encounter/acquisition rules.</span>
          </section>

          {catalog.length === 0 ? (
            <section className="dex-empty-state"><strong>This shared Pokédex has not been synced yet.</strong><p>Run the Shared Game Dex importer and Game Form Availability importer from Admin.</p>{user && <Link className="button button--secondary" to="/admin">Open Admin</Link>}</section>
          ) : (
            <>
              <section className="collection-toolbar" aria-label="Game Dex filters">
                <label className="collection-search"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, form or game Dex number" /></label>
                <div className="filter-pills">{(Object.keys(labels) as Filter[]).map((key) => <button type="button" key={key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{labels[key]}</button>)}</div>
              </section>

              <div className="collection-result-line">
                <span>{visible.length.toLocaleString()} entries shown</span>
                <span>{stats.total.toLocaleString()} tracked slots in this {selectedGame.shortLabel} Dex</span>
                {stats.availableOptionalForms > 0 && <span>{stats.availableOptionalForms.toLocaleString()} compatible optional form slots available</span>}
              </div>

              <section className="dex-card-grid" aria-label={`${game.name} Pokédex`}>
                {visible.map((entry) => {
                  const row = progress[entry.progressKey];
                  const normal = row?.normalOwned ?? false;
                  const shiny = row?.shinyOwned ?? false;
                  const badges = entry.isDefaultForm
                    ? entry.exclusiveGameIds.map((id) => `${versionById.get(id)?.shortLabel ?? 'Version'} only`)
                    : [];
                  const displayName = entry.isDefaultForm ? entry.speciesName : `${entry.speciesName} · ${entry.formName}`;
                  const subtitle = entry.isDefaultForm
                    ? entry.dexName
                    : `${entry.dexName} · ${categoryLabel(entry.formCategory)}${entry.isBattleOnly ? ' · stand-in' : ''}`;

                  const infoContext = pokemonInfoContextForGameDex(game.slug, game.generation, selectedGame.slug);
                  const detailsParams = new URLSearchParams();
                  if (!entry.isDefaultForm && entry.formSlug) detailsParams.set('form', entry.formSlug);
                  detailsParams.set('gen', String(infoContext.generation));
                  detailsParams.set('family', infoContext.familyId);
                  detailsParams.set('vg', infoContext.versionGroup);
                  detailsParams.set('version', infoContext.version);
                  detailsParams.set('fromDex', game.slug);
                  detailsParams.set('fromName', game.name);

                  return (
                    <DexTile
                      key={entry.progressKey}
                      dexNumber={entry.dexNumber}
                      dexNumberWidth={3}
                      nationalDexNumber={entry.nationalDexNumber}
                      name={displayName}
                      subtitle={subtitle}
                      badges={badges}
                      state={tileState(normal, shiny)}
                      forceShinyPreview={filter === 'shiny-missing' || filter === 'shiny-owned'}
                      representationSlot={entry.supportsPlaceholder || entry.isBattleOnly}
                      spriteUrl={entry.spriteUrl}
                      shinySpriteUrl={entry.shinySpriteUrl}
                      detailsHref={`/pokemon/${entry.speciesSlug}?${detailsParams.toString()}`}
                      onCycle={() => void cycle(entry, normal, shiny)}
                    />
                  );
                })}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
