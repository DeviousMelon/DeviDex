import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BankLastChanceNotice } from '../components/BankLastChanceNotice';
import { EvolutionChain } from '../components/EvolutionChain';
import { MoveLearnset } from '../components/MoveLearnset';
import { PokemonGameContextSelector } from '../components/PokemonGameContext';
import { PokemonSprite } from '../components/PokemonSprite';
import { useDexCatalog } from '../hooks/useDexCatalog';
import {
  gameContextStorageKey,
  gameFamilyById,
  gameFamilyForVersionGroup,
  generationRoman,
  inheritedVersionGroupsForContext,
  normalizePokemonGameContext,
  versionLabel,
  VERSION_ORDER,
  type GenerationNumber,
  type PokemonGameContext,
} from '../lib/gameContext';
import {
  englishGenus,
  fetchPokeApiJson,
  genderSummary,
  humanizeApiName,
  pokedexEntryForVersion,
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
  default: 'Default form',
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
  const representationSlot = Boolean(selectedForm?.is_battle_only || selectedForm?.supports_placeholder);

  const isOwned = normalOwned || shinyOwned;

  async function saveCollection(nextNormal: boolean, nextShiny: boolean) {
    if (!selectedForm) return;
    setSaveError(null);
    const result = await setCollectionState(selectedForm.id, nextNormal, nextShiny);
    if (result.error) setSaveError(result.error);
  }

  // Shiny counts as caught, so un-catching clears both.
  const toggleCaught = () => saveCollection(!isOwned, false);
  const toggleShiny = () => saveCollection(true, !shinyOwned);

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
      <main className="pokemon-page">
        <p className="pokemon-page__state">Loading Pokémon…</p>
      </main>
    );
  }

  if (error || !species || !selectedForm) {
    return (
      <main className="pokemon-page">
        <section className="panel pokemon-page__error">
          <h1>That entry wandered off.</h1>
          <p>{error ?? 'No trackable form exists for this species.'}</p>
          <Link className="button button--primary" to="/national-dex">Back to National Dex</Link>
        </section>
      </main>
    );
  }

  const family = gameFamilyById(gameContext.familyId) ?? gameFamilyForVersionGroup(gameContext.versionGroup);
  const displayName = formDisplayName(species.name, selectedForm);
  const genus = speciesDetail ? englishGenus(speciesDetail) : '';
  const entry = speciesDetail ? pokedexEntryForVersion(speciesDetail, gameContext.version, VERSION_ORDER) : null;
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
  const breeding = family?.breedingSupported ?? false;
  const dash = remoteLoading ? '…' : '—';

  const abilities = gameContext.generation < 3
    ? 'None (added in Gen III)'
    : contextAbilities.length
      ? [...contextAbilities]
        .sort((a, b) => a.slot - b.slot)
        .map((row) => `${humanizeApiName(row.ability!.name)}${row.is_hidden ? ' (hidden)' : ''}`)
        .join(', ')
      : dash;

  const facts: Array<[string, string | number]> = [
    ['Abilities', abilities],
    ['Height', pokemonDetail ? formatMetricHeight(pokemonDetail.height) : dash],
    ['Weight', pokemonDetail ? formatMetricWeight(pokemonDetail.weight) : dash],
    ['Gender', gameContext.generation === 1 ? 'No genders in Gen I' : speciesDetail ? genderSummary(speciesDetail.gender_rate) : dash],
    ['Catch rate', speciesDetail?.capture_rate ?? dash],
    ['Base friendship', speciesDetail?.base_happiness ?? dash],
    ['Base experience', pokemonDetail?.base_experience ?? dash],
    ['Growth rate', speciesDetail ? humanizeApiName(speciesDetail.growth_rate.name) : dash],
    ['Egg groups', breeding ? speciesDetail?.egg_groups.map((group) => humanizeApiName(group.name)).join(', ') || dash : 'No breeding in this game'],
    ['Hatch cycles', breeding ? speciesDetail?.hatch_counter ?? dash : 'No breeding in this game'],
    ['Habitat', speciesDetail ? (speciesDetail.habitat ? humanizeApiName(speciesDetail.habitat.name) : 'Unknown') : dash],
    ['Colour · shape', speciesDetail ? `${humanizeApiName(speciesDetail.color.name)} · ${speciesDetail.shape ? humanizeApiName(speciesDetail.shape.name) : 'Unknown'}` : dash],
  ];

  const ownedLabel = representationSlot ? 'Represented' : 'Caught';

  return (
    <main className="pokemon-page">
      <nav className="pokemon-page__crumbs" aria-label="Breadcrumb">
        <Link to="/national-dex">National Dex</Link>
        {backToGameDex && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={backToGameDex}>{fromName || 'Game Dex'}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{species.name}</span>
      </nav>

      <section className="pokemon-hero">
        <div className={`pokemon-hero__art${showShiny ? ' is-shiny' : ''}`}>
          <PokemonSprite
            className="pokemon-hero__sprite"
            nationalDexNumber={species.national_dex_number}
            name={displayName}
            shiny={showShiny}
            spriteUrl={selectedSprite ?? catalogueEntry?.spriteUrl ?? null}
            shinySpriteUrl={selectedForm.shiny_sprite_url ?? catalogueEntry?.shinySpriteUrl ?? null}
          />
          <div className="segmented pokemon-hero__sprite-toggle" role="group" aria-label="Sprite">
            <button type="button" className={!showShiny ? 'is-active' : undefined} aria-pressed={!showShiny} onClick={() => setShowShiny(false)}>Normal</button>
            <button type="button" className={showShiny ? 'is-active' : undefined} aria-pressed={showShiny} onClick={() => setShowShiny(true)}>Shiny</button>
          </div>
        </div>

        <div className="pokemon-hero__body">
          <p className="pokemon-hero__number">{formatDexNumber(species.national_dex_number)} · Generation {generationRoman[species.generation as GenerationNumber] ?? species.generation}</p>
          <h1>{displayName}</h1>
          {genus && <p className="pokemon-hero__genus">{genus}</p>}

          <div className="pokemon-hero__tags">
            {contextTypes.map(({ type }) => (
              <span className={`pokemon-type pokemon-type--${type.name}`} key={type.name}>{humanizeApiName(type.name)}</span>
            ))}
            {(speciesDetail?.is_legendary ?? species.is_legendary) && <span className="pokemon-tag">Legendary</span>}
            {(speciesDetail?.is_mythical ?? species.is_mythical) && <span className="pokemon-tag">Mythical</span>}
            {speciesDetail?.is_baby && <span className="pokemon-tag">Baby</span>}
            {selectedForm.is_battle_only && <span className="pokemon-tag">Battle-only form</span>}
          </div>

          <BankLastChanceNotice speciesId={species.id} formIds={forms.map((form) => form.id)} />

          {entry && (
            <figure className="pokemon-hero__entry">
              <blockquote>{entry.text}</blockquote>
              <figcaption>
                Pokédex · {versionLabel(entry.version)}
                {!entry.exact && <> (no {versionLabel(gameContext.version)} entry yet)</>}
              </figcaption>
            </figure>
          )}
          {remoteError && (
            <p className="pokemon-page__warning">Couldn't reach PokéAPI, so some details are missing. Your collection still works.</p>
          )}

          <div className="pokemon-hero__collect" role="group" aria-label="Your collection">
            <button type="button" className={`collect-toggle${isOwned ? ' is-on' : ''}`} aria-pressed={isOwned} onClick={() => void toggleCaught()}>
              <span aria-hidden="true">{isOwned ? '✓' : '+'}</span> {isOwned ? ownedLabel : `Mark ${ownedLabel.toLowerCase()}`}
            </button>
            <button type="button" className={`collect-toggle collect-toggle--shiny${shinyOwned ? ' is-on' : ''}`} aria-pressed={shinyOwned} onClick={() => void toggleShiny()}>
              <span aria-hidden="true">✦</span> {shinyOwned ? 'Shiny' : 'Mark shiny'}
            </button>
          </div>
          {saveError && <p className="pokemon-page__warning">Couldn't save: {saveError}</p>}

          {forms.length > 1 && (
            <div className="pokemon-hero__forms">
              <span className="pokemon-hero__forms-label">Forms</span>
              <div className="pokemon-form-chips">
                {forms.map((form) => {
                  const row = progress[form.id];
                  const status = tileState(row?.normalOwned ?? false, row?.shinyOwned ?? false);
                  const active = form.id === selectedForm.id;
                  return (
                    <button
                      type="button"
                      key={form.id}
                      className={`pokemon-form-chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      title={`${categoryLabels[form.form_category]} · ${status === 'shiny' ? 'shiny' : status === 'owned' ? 'caught' : 'missing'}`}
                      onClick={() => chooseForm(form)}
                    >
                      <PokemonSprite
                        nationalDexNumber={species.national_dex_number}
                        name={formDisplayName(species.name, form)}
                        shiny={false}
                        spriteUrl={form.sprite_url}
                        shinySpriteUrl={form.shiny_sprite_url}
                      />
                      <span>{form.is_default ? 'Default' : form.name}</span>
                      <i className={`pokemon-form-chip__dot is-${status}`} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <PokemonGameContextSelector
        context={gameContext}
        speciesGeneration={species.generation}
        onChange={chooseGameContext}
      />

      <div className="pokemon-grid">
        <section className="panel pokemon-stats" aria-labelledby="stats-title">
          <div className="panel__head">
            <h2 id="stats-title">Base stats</h2>
            {totalStats != null && <span className="pokemon-stats__total">Total <strong>{totalStats}</strong></span>}
          </div>
          {contextStats.length ? (
            <dl className="pokemon-stats__list">
              {contextStats.map((row) => (
                <div className="pokemon-stats__row" key={row.stat.name}>
                  <dt>{statLabels[row.stat.name] ?? humanizeApiName(row.stat.name)}</dt>
                  <dd>
                    <strong>{row.base_stat}</strong>
                    <span className="pokemon-stats__track" aria-hidden="true">
                      <i style={{ width: `${Math.min((row.base_stat / 200) * 100, 100)}%` }} className={row.base_stat >= 100 ? 'is-high' : row.base_stat < 50 ? 'is-low' : undefined} />
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : <p className="muted">{remoteLoading ? 'Loading…' : 'Stats unavailable.'}</p>}
        </section>

        <section className="panel pokemon-about" aria-labelledby="about-title">
          <div className="panel__head"><h2 id="about-title">About</h2></div>
          <dl className="pokemon-facts">
            {facts.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      {evolutionLoading && (
        <section className="panel pokemon-section"><h2>Evolution</h2><p className="muted">Loading…</p></section>
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
        <section className="panel pokemon-section">
          <h2>Evolution</h2>
          <p className="pokemon-page__warning">Couldn't load the evolution chain. Try refreshing.</p>
        </section>
      )}

      {pokemonDetail && (
        <MoveLearnset
          pokemon={pokemonDetail}
          versionGroup={gameContext.versionGroup}
          breedingSupported={breeding}
        />
      )}

      <nav className="pokemon-neighbours" aria-label="Previous and next Pokémon">
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
    </main>
  );
}
