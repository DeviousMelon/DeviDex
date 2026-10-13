import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EvolutionChain } from '../components/EvolutionChain';
import { MoveLearnset } from '../components/MoveLearnset';
import { PokemonGameContextSelector } from '../components/PokemonGameContext';
import { PokemonSprite } from '../components/PokemonSprite';
import { useDexCatalog } from '../hooks/useDexCatalog';
import {
  gameContextStorageKey,
  gameFamilyById,
  gameFamilyForVersionGroup,
  inheritedVersionGroupsForContext,
  normalizePokemonGameContext,
  type GenerationNumber,
  type PokemonGameContext,
} from '../lib/gameContext';
import {
  englishFlavorTextForVersion,
  englishGenus,
  fetchPokeApiJson,
  genderSummary,
  humanizeApiName,
  pokemonAbilitiesForGeneration,
  pokemonStatsForGeneration,
  pokemonTypesForGeneration,
  type EvolutionChainDetail,
  type PokemonDetail,
  type PokemonSpeciesDetail,
} from '../lib/pokeapi';
import { supabase } from '../lib/supabase';
import type { DexCatalogEntry, FormCategory } from '../types';

type LocalSpecies = {
  id: number;
  national_dex_number: number;
  name: string;
  slug: string;
  generation: number;
  is_legendary: boolean;
  is_mythical: boolean;
};

type LocalForm = {
  id: number;
  slug: string;
  name: string;
  is_default: boolean;
  is_trackable: boolean;
  form_category: FormCategory;
  source_pokemon_id: number | null;
  is_battle_only: boolean;
  supports_placeholder: boolean;
  sprite_url: string | null;
  shiny_sprite_url: string | null;
  form_order: number;
};

type NeighborSpecies = Pick<LocalSpecies, 'slug' | 'name' | 'national_dex_number'>;

const categoryLabels: Record<FormCategory, string> = {
  default: 'Base species',
  regional: 'Regional form',
  alternate: 'Alternate form',
  pattern: 'Pattern / set',
  gender: 'Gender difference',
  battle: 'Battle-only form',
  special: 'Special / cosmetic',
};

const statLabels: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
  special: 'Special',
};

function formatDexNumber(number: number) {
  return `#${String(number).padStart(4, '0')}`;
}

function formatMetricHeight(decimetres: number) {
  const metres = decimetres / 10;
  return `${metres.toLocaleString(undefined, { maximumFractionDigits: 1 })} m`;
}

function formatMetricWeight(hectograms: number) {
  const kilograms = hectograms / 10;
  return `${kilograms.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

function tileState(normalOwned: boolean, shinyOwned: boolean) {
  if (shinyOwned) return 'shiny' as const;
  if (normalOwned) return 'owned' as const;
  return 'missing' as const;
}

function formDisplayName(speciesName: string, form: LocalForm) {
  return form.is_default ? speciesName : `${speciesName} · ${form.name}`;
}

function storedGameContext(): Partial<PokemonGameContext> | null {
  try {
    const raw = window.localStorage.getItem(gameContextStorageKey());
    return raw ? JSON.parse(raw) as Partial<PokemonGameContext> : null;
  } catch {
    return null;
  }
}

function contextFromParams(params: URLSearchParams): Partial<PokemonGameContext> | null {
  const generation = Number(params.get('gen'));
  const familyId = params.get('family') ?? undefined;
  const versionGroup = params.get('vg') ?? undefined;
  const version = params.get('version') ?? undefined;
  if (!generation && !familyId && !versionGroup && !version) return null;
  return {
    generation: generation || undefined,
    familyId,
    versionGroup,
    version,
  } as Partial<PokemonGameContext>;
}

function sameContext(a: PokemonGameContext, b: PokemonGameContext) {
  return a.generation === b.generation
    && a.familyId === b.familyId
    && a.versionGroup === b.versionGroup
    && a.version === b.version;
}

export function PokemonDetailPage() {
  const { speciesSlug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFormSlug = searchParams.get('form');
  const { allCatalog, progress, setCollectionState } = useDexCatalog();

  const [gameContext, setGameContext] = useState<PokemonGameContext>(() => normalizePokemonGameContext(
    contextFromParams(searchParams) ?? storedGameContext(),
  ));
  const [species, setSpecies] = useState<LocalSpecies | null>(null);
  const [forms, setForms] = useState<LocalForm[]>([]);
  const [previousSpecies, setPreviousSpecies] = useState<NeighborSpecies | null>(null);
  const [nextSpecies, setNextSpecies] = useState<NeighborSpecies | null>(null);
  const [pokemonDetail, setPokemonDetail] = useState<PokemonDetail | null>(null);
  const [speciesDetail, setSpeciesDetail] = useState<PokemonSpeciesDetail | null>(null);
  const [evolutionChain, setEvolutionChain] = useState<EvolutionChainDetail | null>(null);
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [evolutionError, setEvolutionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [showShiny, setShowShiny] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const contextParamKey = [
    searchParams.get('gen') ?? '',
    searchParams.get('family') ?? '',
    searchParams.get('vg') ?? '',
    searchParams.get('version') ?? '',
  ].join('|');

  // Links from a Game Dex carry an explicit context. Browser back/forward can
  // therefore restore that context even though this route component stays mounted.
  useEffect(() => {
    const fromUrl = contextFromParams(searchParams);
    if (!fromUrl) return;
    const normalized = normalizePokemonGameContext(fromUrl);
    setGameContext((current) => sameContext(current, normalized) ? current : normalized);
  }, [contextParamKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      window.localStorage.setItem(gameContextStorageKey(), JSON.stringify(gameContext));
    } catch {
      // Losing a UI preference must never break the Pokémon page.
    }
  }, [gameContext]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalCatalogue() {
      if (!supabase) {
        setError('Supabase is not configured.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSpecies(null);
      setForms([]);
      setPreviousSpecies(null);
      setNextSpecies(null);

      const { data: speciesRow, error: speciesError } = await supabase
        .from('pokemon_species')
        .select('id, national_dex_number, name, slug, generation, is_legendary, is_mythical')
        .eq('slug', speciesSlug)
        .maybeSingle();

      if (cancelled) return;
      if (speciesError) {
        setError(speciesError.message);
        setLoading(false);
        return;
      }
      if (!speciesRow) {
        setError('That Pokémon is not in the DeviDex catalogue.');
        setLoading(false);
        return;
      }

      const localSpecies = speciesRow as LocalSpecies;
      setSpecies(localSpecies);

      const [formsResult, previousResult, nextResult] = await Promise.all([
        supabase
          .from('pokemon_forms')
          .select('id, slug, name, is_default, is_trackable, form_category, source_pokemon_id, is_battle_only, supports_placeholder, sprite_url, shiny_sprite_url, form_order')
          .eq('species_id', localSpecies.id)
          .eq('is_trackable', true)
          .order('form_order', { ascending: true }),
        supabase
          .from('pokemon_species')
          .select('slug, name, national_dex_number')
          .lt('national_dex_number', localSpecies.national_dex_number)
          .order('national_dex_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('pokemon_species')
          .select('slug, name, national_dex_number')
          .gt('national_dex_number', localSpecies.national_dex_number)
          .order('national_dex_number', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (formsResult.error) {
        setError(formsResult.error.message);
        setLoading(false);
        return;
      }

      const formRows = (formsResult.data ?? []) as LocalForm[];
      setForms(formRows);
      setPreviousSpecies((previousResult.data as NeighborSpecies | null) ?? null);
      setNextSpecies((nextResult.data as NeighborSpecies | null) ?? null);
      setLoading(false);
    }

    void loadLocalCatalogue();
    return () => { cancelled = true; };
  }, [speciesSlug]);

  const selectedForm = useMemo(() => {
    if (!forms.length) return null;
    if (requestedFormSlug) {
      const requested = forms.find((form) => form.slug === requestedFormSlug);
      if (requested) return requested;
    }
    return forms.find((form) => form.is_default) ?? forms[0];
  }, [forms, requestedFormSlug]);

  useEffect(() => {
    if (!species || !selectedForm) return;
    const controller = new AbortController();
    const speciesId = species.id;
    const sourcePokemonId = selectedForm.source_pokemon_id;

    async function loadRemoteDetails() {
      setRemoteLoading(true);
      setRemoteError(null);
      setPokemonDetail(null);
      setSpeciesDetail(null);

      try {
        const pokemonId = sourcePokemonId ?? speciesId;
        const [pokemon, speciesInfo] = await Promise.all([
          fetchPokeApiJson<PokemonDetail>(`https://pokeapi.co/api/v2/pokemon/${pokemonId}/`, controller.signal),
          fetchPokeApiJson<PokemonSpeciesDetail>(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}/`, controller.signal),
        ]);
        setPokemonDetail(pokemon);
        setSpeciesDetail(speciesInfo);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setRemoteError(loadError instanceof Error ? loadError.message : 'Could not load PokéAPI details.');
      } finally {
        if (!controller.signal.aborted) setRemoteLoading(false);
      }
    }

    void loadRemoteDetails();
    return () => controller.abort();
  }, [selectedForm, species]);

  useEffect(() => {
    const chainUrl = speciesDetail?.evolution_chain?.url;
    if (!chainUrl) {
      setEvolutionChain(null);
      setEvolutionError(null);
      setEvolutionLoading(false);
      return;
    }

    const controller = new AbortController();
    const evolutionChainUrl = chainUrl;

    async function loadEvolutionChain() {
      setEvolutionLoading(true);
      setEvolutionError(null);
      setEvolutionChain(null);

      try {
        const chain = await fetchPokeApiJson<EvolutionChainDetail>(evolutionChainUrl, controller.signal);
        setEvolutionChain(chain);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setEvolutionError(loadError instanceof Error ? loadError.message : 'Could not load evolution data.');
      } finally {
        if (!controller.signal.aborted) setEvolutionLoading(false);
      }
    }

    void loadEvolutionChain();
    return () => controller.abort();
  }, [speciesDetail?.evolution_chain?.url]);

  useEffect(() => {
    if (!species) return;
    const oldTitle = document.title;
    document.title = `${species.name} | DeviDex`;
    return () => { document.title = oldTitle; };
  }, [species]);

  useEffect(() => {
    setShowShiny(false);
  }, [selectedForm?.id]);

  // A context from an older species remains useful while browsing neighbours,
  // but it cannot precede the selected species' introduction generation.
  useEffect(() => {
    if (!species || gameContext.generation >= species.generation) return;
    const next = normalizePokemonGameContext({ generation: species.generation as GenerationNumber });
    setGameContext(next);
  }, [gameContext.generation, species]);

  const catalogueEntry = useMemo<DexCatalogEntry | undefined>(() => {
    if (!selectedForm) return undefined;
    return allCatalog.find((entry) => entry.formId === selectedForm.id);
  }, [allCatalog, selectedForm]);

  const selectedProgress = selectedForm ? progress[selectedForm.id] : undefined;
  const normalOwned = selectedProgress?.normalOwned ?? false;
  const shinyOwned = selectedProgress?.shinyOwned ?? false;
  const collectionState = tileState(normalOwned, shinyOwned);
  const representationSlot = Boolean(selectedForm?.is_battle_only || selectedForm?.supports_placeholder);

  async function cycleCollectionState() {
    if (!selectedForm) return;
    setSaveError(null);

    let nextNormal = false;
    let nextShiny = false;
    if (!normalOwned && !shinyOwned) nextNormal = true;
    else if (!shinyOwned) {
      nextNormal = true;
      nextShiny = true;
    }

    const result = await setCollectionState(selectedForm.id, nextNormal, nextShiny);
    if (result.error) setSaveError(result.error);
  }

  function chooseForm(form: LocalForm) {
    const next = new URLSearchParams(searchParams);
    if (form.is_default) next.delete('form');
    else next.set('form', form.slug);
    setSearchParams(next, { replace: true });
  }

  function chooseGameContext(nextContext: PokemonGameContext) {
    const normalized = normalizePokemonGameContext(nextContext);
    setGameContext(normalized);
    const next = new URLSearchParams(searchParams);
    next.set('gen', String(normalized.generation));
    next.set('family', normalized.familyId);
    next.set('vg', normalized.versionGroup);
    next.set('version', normalized.version);
    setSearchParams(next, { replace: true });
  }

  const contextualQuery = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('form');
    next.set('gen', String(gameContext.generation));
    next.set('family', gameContext.familyId);
    next.set('vg', gameContext.versionGroup);
    next.set('version', gameContext.version);
    return next.toString();
  }, [gameContext, searchParams]);

  if (loading) {
    return (
      <main className="pokemon-detail-page">
        <section className="pokemon-detail-loading">Loading Pokémon information…</section>
      </main>
    );
  }

  if (error || !species || !selectedForm) {
    return (
      <main className="pokemon-detail-page">
        <section className="pokemon-detail-error">
          <p className="eyebrow">POKÉMON</p>
          <h1>That entry wandered off.</h1>
          <p>{error ?? 'No trackable form exists for this species.'}</p>
          <Link className="button button--primary" to="/national-dex">Back to National Dex</Link>
        </section>
      </main>
    );
  }

  const family = gameFamilyById(gameContext.familyId) ?? gameFamilyForVersionGroup(gameContext.versionGroup);
  const displayName = formDisplayName(species.name, selectedForm);
  const genus = speciesDetail ? englishGenus(speciesDetail) : 'Pokémon';
  const flavorText = speciesDetail ? englishFlavorTextForVersion(speciesDetail, gameContext.version) : '';
  const selectedSprite = showShiny
    ? selectedForm.shiny_sprite_url ?? pokemonDetail?.sprites.front_shiny
    : selectedForm.sprite_url ?? pokemonDetail?.sprites.front_default;
  const contextTypes = pokemonDetail ? pokemonTypesForGeneration(pokemonDetail, gameContext.generation) : [];
  const contextAbilities = pokemonDetail ? pokemonAbilitiesForGeneration(pokemonDetail, gameContext.generation) : [];
  const contextStats = pokemonDetail ? pokemonStatsForGeneration(pokemonDetail, gameContext.generation) : [];
  const totalStats = contextStats.reduce((sum, row) => sum + row.base_stat, 0) || null;
  const evolutionVersionGroups = inheritedVersionGroupsForContext(gameContext.versionGroup);
  const contextName = family?.contexts.find((item) => item.versionGroup === gameContext.versionGroup)?.label
    ?? gameContext.versionGroup;
  const fromDex = searchParams.get('fromDex');
  const fromName = searchParams.get('fromName');
  const backToGameDex = fromDex ? `/games/${fromDex}?version=${encodeURIComponent(gameContext.version)}` : null;

  return (
    <main className="pokemon-detail-page">
      <nav className="pokemon-detail-breadcrumbs" aria-label="Pokémon navigation">
        <Link to="/national-dex">National Dex</Link>
        {backToGameDex && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={backToGameDex}>{fromName || 'Game Dex'}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span>{species.name}</span>
      </nav>

      {backToGameDex && (
        <Link className="pokemon-detail-return-link" to={backToGameDex}>← Back to {fromName || 'Game Dex'}</Link>
      )}

      <PokemonGameContextSelector
        context={gameContext}
        speciesGeneration={species.generation}
        onChange={chooseGameContext}
      />

      <section className="pokemon-detail-hero">
        <div className={`pokemon-detail-art${showShiny ? ' is-shiny' : ''}`}>
          <span className="pokemon-detail-art__number">{formatDexNumber(species.national_dex_number)}</span>
          <PokemonSprite
            className="pokemon-detail-art__sprite"
            nationalDexNumber={species.national_dex_number}
            name={displayName}
            shiny={showShiny}
            spriteUrl={selectedSprite ?? catalogueEntry?.spriteUrl ?? null}
            shinySpriteUrl={selectedForm.shiny_sprite_url ?? catalogueEntry?.shinySpriteUrl ?? null}
          />
          <div className="pokemon-detail-art__toggles" aria-label="Sprite preview">
            <button type="button" className={!showShiny ? 'is-active' : ''} onClick={() => setShowShiny(false)}>Normal</button>
            <button type="button" className={showShiny ? 'is-active' : ''} onClick={() => setShowShiny(true)}>Shiny ✦</button>
          </div>
        </div>

        <div className="pokemon-detail-intro">
          <p className="eyebrow">INTRODUCED GENERATION {species.generation} · {categoryLabels[selectedForm.form_category]}</p>
          <h1>{displayName}</h1>
          <p className="pokemon-detail-genus">{genus}</p>

          <div className="pokemon-detail-tags">
            {contextTypes.map(({ type }) => (
              <span className={`pokemon-type pokemon-type--${type.name}`} key={type.name}>{humanizeApiName(type.name)}</span>
            ))}
            {(speciesDetail?.is_legendary ?? species.is_legendary) && <span className="pokemon-special-tag">Legendary</span>}
            {(speciesDetail?.is_mythical ?? species.is_mythical) && <span className="pokemon-special-tag">Mythical</span>}
            {speciesDetail?.is_baby && <span className="pokemon-special-tag">Baby</span>}
            {representationSlot && <span className="pokemon-special-tag pokemon-special-tag--orange">Representation slot</span>}
          </div>

          {flavorText && <p className="pokemon-detail-flavor">{flavorText}</p>}
          {remoteLoading && <p className="pokemon-detail-source-state">Loading PokéAPI species details…</p>}
          {remoteError && (
            <p className="pokemon-detail-source-state pokemon-detail-source-state--warning">
              Live PokéAPI details are temporarily unavailable. DeviDex collection/form data still works. {remoteError}
            </p>
          )}

          <div className="pokemon-collection-card">
            <div>
              <span>Your collection</span>
              <strong>
                {representationSlot
                  ? collectionState === 'shiny' ? 'Shiny represented' : collectionState === 'owned' ? 'Represented' : 'Unrepresented'
                  : collectionState === 'shiny' ? 'Shiny owned' : collectionState === 'owned' ? 'Owned' : 'Missing'}
              </strong>
            </div>
            <button
              className={`button ${collectionState === 'shiny' ? 'button--gold' : 'button--primary'}`}
              type="button"
              onClick={() => void cycleCollectionState()}
            >
              Cycle status
            </button>
          </div>
          {saveError && <p className="form-rules-error">Could not save collection status: {saveError}</p>}
        </div>
      </section>

      <section className="pokemon-detail-grid" id="overview">
        <article className="pokemon-info-card">
          <div className="pokemon-info-card__heading">
            <p className="eyebrow">BATTLE PROFILE · GENERATION {gameContext.generation}</p>
            <h2>Types & abilities</h2>
          </div>
          <div className="pokemon-detail-fact-list">
            <div><span>Types</span><strong>{contextTypes.map((row) => humanizeApiName(row.type.name)).join(' / ') || 'Unavailable'}</strong></div>
            <div>
              <span>Abilities</span>
              <strong>
                {gameContext.generation < 3
                  ? 'Abilities did not exist yet'
                  : contextAbilities.length
                    ? [...contextAbilities]
                      .sort((a, b) => a.slot - b.slot)
                      .map((row) => `${humanizeApiName(row.ability!.name)}${row.is_hidden ? ' (Hidden)' : ''}`)
                      .join(' · ')
                    : 'Unavailable'}
              </strong>
            </div>
            <div><span>Base experience</span><strong>{pokemonDetail?.base_experience ?? '—'}</strong></div>
            <div><span>Base stat total</span><strong>{totalStats ?? '—'}</strong></div>
          </div>
        </article>

        <article className="pokemon-info-card">
          <div className="pokemon-info-card__heading">
            <p className="eyebrow">SPECIES</p>
            <h2>General details</h2>
          </div>
          <div className="pokemon-detail-fact-list pokemon-detail-fact-list--two-column">
            <div><span>Height</span><strong>{pokemonDetail ? formatMetricHeight(pokemonDetail.height) : '—'}</strong></div>
            <div><span>Weight</span><strong>{pokemonDetail ? formatMetricWeight(pokemonDetail.weight) : '—'}</strong></div>
            <div><span>Gender</span><strong>{gameContext.generation === 1 ? 'Gender mechanic not used' : speciesDetail ? genderSummary(speciesDetail.gender_rate) : '—'}</strong></div>
            <div><span>Capture rate</span><strong>{speciesDetail?.capture_rate ?? '—'}</strong></div>
            <div><span>Base friendship</span><strong>{speciesDetail?.base_happiness ?? '—'}</strong></div>
            <div><span>Hatch cycles</span><strong>{family?.breedingSupported ? speciesDetail?.hatch_counter ?? '—' : 'Breeding unavailable'}</strong></div>
            <div><span>Growth rate</span><strong>{speciesDetail ? humanizeApiName(speciesDetail.growth_rate.name) : '—'}</strong></div>
            <div><span>Egg groups</span><strong>{family?.breedingSupported ? speciesDetail?.egg_groups.map((group) => humanizeApiName(group.name)).join(' / ') || '—' : 'Breeding unavailable'}</strong></div>
            <div><span>Habitat</span><strong>{speciesDetail?.habitat ? humanizeApiName(speciesDetail.habitat.name) : 'Unknown'}</strong></div>
            <div><span>Colour</span><strong>{speciesDetail ? humanizeApiName(speciesDetail.color.name) : '—'}</strong></div>
            <div><span>Shape</span><strong>{speciesDetail?.shape ? humanizeApiName(speciesDetail.shape.name) : 'Unknown'}</strong></div>
            <div><span>Gender differences</span><strong>{speciesDetail ? (speciesDetail.has_gender_differences ? 'Yes' : 'No') : '—'}</strong></div>
          </div>
          <p className="pokemon-card-context-note">Some species-wide fields are not historically versioned by PokéAPI. Types, abilities, stats, flavor text, moves and versioned evolution rules use the selected context where the source supports it.</p>
        </article>
      </section>

      <section className="pokemon-info-card pokemon-stats-card">
        <div className="pokemon-info-card__heading pokemon-info-card__heading--inline">
          <div>
            <p className="eyebrow">BASE STATS · GENERATION {gameContext.generation}</p>
            <h2>Stat spread</h2>
          </div>
          {totalStats != null && <strong>BST {totalStats}</strong>}
        </div>

        <div className="pokemon-stat-list">
          {contextStats.length ? contextStats.map((row) => (
            <div className="pokemon-stat-row" key={row.stat.name}>
              <span>{statLabels[row.stat.name] ?? humanizeApiName(row.stat.name)}</span>
              <strong>{row.base_stat}</strong>
              <div className="pokemon-stat-track" aria-hidden="true">
                <i style={{ width: `${Math.min((row.base_stat / 255) * 100, 100)}%` }} />
              </div>
            </div>
          )) : <p>Stat data unavailable.</p>}
        </div>
      </section>

      {evolutionLoading && (
        <section className="pokemon-info-card pokemon-evolution-card">
          <div className="pokemon-info-card__heading">
            <p className="eyebrow">EVOLUTION</p>
            <h2>Loading evolution chain…</h2>
          </div>
        </section>
      )}

      {!evolutionLoading && evolutionChain && (
        <EvolutionChain
          chain={evolutionChain}
          currentSpeciesSlug={species.slug}
          versionGroups={evolutionVersionGroups}
          contextLabel={contextName}
          queryString={contextualQuery}
        />
      )}

      {!evolutionLoading && evolutionError && (
        <section className="pokemon-info-card pokemon-evolution-card">
          <div className="pokemon-info-card__heading">
            <p className="eyebrow">EVOLUTION</p>
            <h2>Evolution data unavailable</h2>
          </div>
          <p className="pokemon-detail-source-state pokemon-detail-source-state--warning">
            The rest of this Pokémon page still works. {evolutionError}
          </p>
        </section>
      )}

      {pokemonDetail && (
        <MoveLearnset
          pokemon={pokemonDetail}
          versionGroup={gameContext.versionGroup}
          breedingSupported={family?.breedingSupported ?? false}
        />
      )}

      <section className="pokemon-info-card pokemon-forms-card">
        <div className="pokemon-info-card__heading pokemon-info-card__heading--inline">
          <div>
            <p className="eyebrow">FORMS</p>
            <h2>{forms.length === 1 ? 'This species has one DeviDex slot' : `${forms.length} DeviDex form slots`}</h2>
          </div>
          <span>Information pages show all catalogue forms, even when a form category is disabled in your active collection.</span>
        </div>

        <div className="pokemon-form-picker">
          {forms.map((form) => {
            const active = form.id === selectedForm.id;
            const row = progress[form.id];
            const status = tileState(row?.normalOwned ?? false, row?.shinyOwned ?? false);
            return (
              <button
                className={`pokemon-form-option${active ? ' is-active' : ''}`}
                type="button"
                key={form.id}
                onClick={() => chooseForm(form)}
              >
                <PokemonSprite
                  nationalDexNumber={species.national_dex_number}
                  name={formDisplayName(species.name, form)}
                  shiny={false}
                  spriteUrl={form.sprite_url}
                  shinySpriteUrl={form.shiny_sprite_url}
                />
                <span>
                  <strong>{form.is_default ? 'Default' : form.name}</strong>
                  <small>{categoryLabels[form.form_category]} · {status === 'shiny' ? 'Shiny' : status === 'owned' ? 'Owned' : 'Missing'}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <nav className="pokemon-neighbor-nav" aria-label="Previous and next Pokémon">
        {previousSpecies ? (
          <Link to={`/pokemon/${previousSpecies.slug}?${contextualQuery}`}>
            <span>← Previous</span>
            <strong>{formatDexNumber(previousSpecies.national_dex_number)} {previousSpecies.name}</strong>
          </Link>
        ) : <span />}
        {nextSpecies ? (
          <Link to={`/pokemon/${nextSpecies.slug}?${contextualQuery}`}>
            <span>Next →</span>
            <strong>{formatDexNumber(nextSpecies.national_dex_number)} {nextSpecies.name}</strong>
          </Link>
        ) : <span />}
      </nav>

      <p className="pokemon-detail-source-note">
        Pokémon identity, form tracking and collection progress come from DeviDex. Game-context data is loaded from PokéAPI on demand; where PokéAPI does not historically version a field, DeviDex labels it as species-wide rather than inventing a game-specific value.
      </p>
    </main>
  );
}
