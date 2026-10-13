import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CollectionSetupPanel } from '../components/CollectionSetupPanel';
import { DexBoxes } from '../components/DexBoxes';
import { DexToolbar, type DexFilter } from '../components/DexToolbar';
import { DexTile, type DexTileState } from '../components/DexTile';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useGameDex } from '../hooks/useGameDex';
import { pokemonInfoContextForGameDex } from '../lib/gameContext';
import type { FormCategory, GameDexCatalogEntry } from '../types';

const FORM_LABELS: Record<Exclude<FormCategory, 'default'>, string> = {
  regional: 'Regional form',
  alternate: 'Alternate form',
  pattern: 'Pattern',
  gender: 'Gender difference',
  battle: 'Battle form',
  special: 'Special form',
};

const tileState = (normal: boolean, shiny: boolean): DexTileState => (shiny ? 'shiny' : normal ? 'owned' : 'missing');
const pad = (n: number) => `#${String(n).padStart(3, '0')}`;

export function GameDexPage() {
  const { gameSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { game, versions, selectedGame, catalog, progress, stats, availableFormCategoryCounts, loading, error, setCollectionState } =
    useGameDex(gameSlug, searchParams.get('version'));
  const [filter, setFilter] = useState<DexFilter>('all');
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const versionById = useMemo(() => new Map(versions.map((version) => [version.id, version])), [versions]);
  const hasMultipleDexes = useMemo(() => new Set(catalog.map((entry) => entry.dexSlug)).size > 1, [catalog]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog.filter((entry) => {
      const row = progress[entry.progressKey];
      const normal = row?.normalOwned ?? false;
      const shiny = row?.shinyOwned ?? false;
      const matches = !needle
        || entry.speciesName.toLowerCase().includes(needle)
        || entry.formName?.toLowerCase().includes(needle)
        || entry.formSlug?.toLowerCase().includes(needle)
        || String(entry.dexNumber).includes(needle);
      if (!matches) return false;
      if (filter === 'missing') return !normal;
      if (filter === 'owned') return normal;
      if (filter === 'shiny-missing') return !shiny;
      if (filter === 'shiny-owned') return shiny;
      return true;
    });
  }, [catalog, filter, progress, search]);

  async function cycle(entry: GameDexCatalogEntry) {
    setSaveError(null);
    const row = progress[entry.progressKey];
    const normal = row?.normalOwned ?? false;
    const shiny = row?.shinyOwned ?? false;
    const [nextNormal, nextShiny] = !normal && !shiny ? [true, false] : !shiny ? [true, true] : [false, false];
    const result = await setCollectionState(entry, nextNormal, nextShiny);
    if (result.error) setSaveError(result.error);
  }

  function chooseVersion(slug: string) {
    const next = new URLSearchParams(searchParams);
    next.set('version', slug);
    setSearchParams(next, { replace: true });
  }

  const back = <Link to="/games">← All Game Dexes</Link>;

  if (loading) return <main className="dex-page"><PageHeader back={back} title="Loading…" /></main>;
  if (error || !game || !selectedGame) {
    return (
      <main className="dex-page">
        <PageHeader back={back} title="Game Dex not found" description={error ?? 'That Pokédex does not exist.'} />
      </main>
    );
  }

  const infoContext = pokemonInfoContextForGameDex(game.slug, game.generation, selectedGame.slug);
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const boxed = filter === 'all' && !search.trim();

  return (
    <main className="dex-page">
      <PageHeader
        back={back}
        title={game.name}
        description={`Generation ${game.generation}${game.scopeType === 'dlc' ? ' · DLC Pokédex' : ''}${game.regionLabel ? ` · ${game.regionLabel}` : ''}`}
        aside={(
          <div className="stat-inline">
            <div><strong>{stats.livingOwned}<small>/{stats.total}</small></strong><span>owned · {pct(stats.livingOwned)}%</span></div>
            <div className="is-shiny"><strong>{stats.shinyOwned}</strong><span>shiny</span></div>
          </div>
        )}
      />

      {versions.length > 1 && (
        <div className="version-pick" role="group" aria-label="Which version are you playing?">
          <span>Playing</span>
          <div className="segmented">
            {versions.map((version) => (
              <button key={version.id} type="button" className={selectedGame.id === version.id ? 'is-active' : undefined} aria-pressed={selectedGame.id === version.id} onClick={() => chooseVersion(version.slug)}>
                {version.shortLabel}
              </button>
            ))}
          </div>
          <small>Each version keeps its own progress.</small>
        </div>
      )}

      {!user && (
        <p className="guest-note">
          You're trying DeviDex as a guest. Your ticks disappear when you close the tab. <Link to="/login">Sign in to save them</Link>.
        </p>
      )}

      <CollectionSetupPanel
        categoryCounts={availableFormCategoryCounts}
        formsNote={`Only forms that exist in ${selectedGame.shortLabel} count here. It's the same setup as your National Dex.`}
      />

      <DexToolbar
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        placeholder="Search name or regional number"
        resultText={boxed ? undefined : `${visible.length.toLocaleString()} shown`}
      />

      {saveError && <p className="form-message form-message--error" role="alert">That change wasn't saved: {saveError}</p>}

      {catalog.length === 0 ? (
        <div className="dex-status">
          <strong>This Pokédex hasn't been imported yet.</strong>
          {user && <span> An admin can import it from the <Link to="/admin">Admin page</Link>.</span>}
        </div>
      ) : visible.length === 0 ? (
        <div className="dex-status">
          <strong>Nothing matches.</strong> <button className="text-button" type="button" onClick={() => { setSearch(''); setFilter('all'); }}>Clear search and filters</button>
        </div>
      ) : (
        <DexBoxes
          items={visible}
          boxed={boxed}
          label={`${game.name} Pokédex`}
          itemKey={(entry) => entry.progressKey}
          isOwned={(entry) => Boolean(progress[entry.progressKey]?.normalOwned)}
          boxRange={(box) => `${pad(box[0].dexNumber)}–${pad(box[box.length - 1].dexNumber)}`}
          renderItem={(entry) => {
            const row = progress[entry.progressKey];
            const params = new URLSearchParams();
            if (!entry.isDefaultForm && entry.formSlug) params.set('form', entry.formSlug);
            params.set('gen', String(infoContext.generation));
            params.set('family', infoContext.familyId);
            params.set('vg', infoContext.versionGroup);
            params.set('version', infoContext.version);
            params.set('fromDex', game.slug);
            params.set('fromName', game.name);
            const subtitle = entry.isDefaultForm
              ? (hasMultipleDexes ? entry.dexName : undefined)
              : entry.formCategory === 'default' ? undefined : FORM_LABELS[entry.formCategory];
            return (
              <DexTile
                dexNumber={entry.dexNumber}
                dexNumberWidth={3}
                nationalDexNumber={entry.nationalDexNumber}
                name={entry.isDefaultForm ? entry.speciesName : `${entry.speciesName} · ${entry.formName}`}
                subtitle={subtitle}
                badges={entry.isDefaultForm ? entry.exclusiveGameIds.map((id) => `${versionById.get(id)?.shortLabel ?? 'Version'} only`) : []}
                state={tileState(row?.normalOwned ?? false, row?.shinyOwned ?? false)}
                forceShinyPreview={filter === 'shiny-missing' || filter === 'shiny-owned'}
                representationSlot={entry.supportsPlaceholder || entry.isBattleOnly}
                spriteUrl={entry.spriteUrl}
                shinySpriteUrl={entry.shinySpriteUrl}
                detailsHref={`/pokemon/${entry.speciesSlug}?${params.toString()}`}
                onCycle={() => void cycle(entry)}
              />
            );
          }}
        />
      )}
    </main>
  );
}
