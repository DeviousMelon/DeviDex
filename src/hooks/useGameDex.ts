import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useGuestProgress } from '../context/GuestProgressContext';
import { supabase } from '../lib/supabase';
import type {
  FormCategory,
  GameDexCatalogEntry,
  GameDexEntryProgress,
  GameDexScopeType,
  GameDexSetSummary,
  GameVersionOption,
} from '../types';

type RawSet = {
  id: number;
  slug: string;
  name: string;
  generation: number;
  release_order: number;
  scope_type: GameDexScopeType;
  region_label: string | null;
  parent_set_id: number | null;
  description: string | null;
};

type RawMember = {
  game_id: number;
  member_order: number;
  short_label: string | null;
  games: { id: number; slug: string; name: string } | Array<{ id: number; slug: string; name: string }>;
};

type RawEntry = {
  set_id: number;
  species_id: number;
  dex_number: number | null;
  dex_slug: string;
  dex_name: string;
  dex_order: number;
  pokemon_species: { id: number; national_dex_number: number; name: string; slug: string } | Array<{ id: number; national_dex_number: number; name: string; slug: string }>;
};

type RawExclusive = { species_id: number; game_id: number };
type RawBaseProgress = { species_id: number; normal_owned: boolean; shiny_owned: boolean };
type RawFormProgress = { form_id: number; normal_owned: boolean; shiny_owned: boolean };

type RawAvailableForm = {
  form_id: number;
  pokemon_forms: {
    id: number;
    species_id: number;
    name: string;
    slug: string;
    form_category: FormCategory;
    form_order: number;
    is_battle_only: boolean;
    supports_placeholder: boolean;
    sprite_url: string | null;
    shiny_sprite_url: string | null;
  } | Array<{
    id: number;
    species_id: number;
    name: string;
    slug: string;
    form_category: FormCategory;
    form_order: number;
    is_battle_only: boolean;
    supports_placeholder: boolean;
    sprite_url: string | null;
    shiny_sprite_url: string | null;
  }>;
};

const PAGE_SIZE = 500;
const baseKey = (speciesId: number) => `species:${speciesId}`;
const formKey = (formId: number) => `form:${formId}`;

export function useGameDex(setSlug: string | undefined, preferredGameSlug?: string | null) {
  const { user } = useAuth();
  const { categoryEnabled } = useFormPreferences();
  const {
    gameProgress,
    gameFormProgress,
    setGameState,
    setGameFormState,
    markGameDexStarted,
  } = useGuestProgress();
  const [game, setGame] = useState<GameDexSetSummary | null>(null);
  const [versions, setVersions] = useState<GameVersionOption[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameVersionOption | null>(null);
  const [allCatalog, setAllCatalog] = useState<GameDexCatalogEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, GameDexEntryProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !setSlug) {
      setError(!supabase ? 'Supabase is not configured.' : 'No Game Dex was selected.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let resolvedPreferredGameSlug = preferredGameSlug ?? null;
    let { data: setData, error: dbSetError } = await supabase
      .from('game_dex_sets')
      .select('id, slug, name, generation, release_order, scope_type, region_label, parent_set_id, description')
      .eq('slug', setSlug)
      .maybeSingle();

    // Keep every old /games/scarlet-style bookmark alive after the shared-Dex
    // rebuild. The matching version is selected when possible.
    if (!setData && !dbSetError) {
      const { data: legacyGame } = await supabase.from('games').select('id').eq('slug', setSlug).maybeSingle();
      if (legacyGame) {
        resolvedPreferredGameSlug = resolvedPreferredGameSlug ?? setSlug;
        const { data: memberships } = await supabase
          .from('game_dex_set_members')
          .select('set_id, game_dex_sets!inner(id, slug, name, generation, release_order, scope_type, region_label, parent_set_id, description)')
          .eq('game_id', legacyGame.id);
        const base = (memberships ?? [])
          .map((row: any) => Array.isArray(row.game_dex_sets) ? row.game_dex_sets[0] : row.game_dex_sets)
          .filter(Boolean)
          .sort((a: any, b: any) => (a.scope_type === 'base' ? -1 : 1) - (b.scope_type === 'base' ? -1 : 1))[0];
        setData = base ?? null;
      }
    }

    if (dbSetError || !setData) {
      setError(dbSetError?.message ?? 'That shared Game Dex does not exist in DeviDex.');
      setLoading(false);
      return;
    }

    const rawSet = setData as RawSet;
    const { data: memberData, error: memberError } = await supabase
      .from('game_dex_set_members')
      .select('game_id, member_order, short_label, games!inner(id, slug, name)')
      .eq('set_id', rawSet.id)
      .order('member_order', { ascending: true });
    if (memberError) { setError(memberError.message); setLoading(false); return; }

    const memberOptions: GameVersionOption[] = ((memberData ?? []) as unknown as RawMember[]).flatMap((row) => {
      const g = Array.isArray(row.games) ? row.games[0] : row.games;
      return g ? [{ id: g.id, slug: g.slug, name: g.name, shortLabel: row.short_label || g.name, memberOrder: row.member_order }] : [];
    });
    const selected = memberOptions.find((item) => item.slug === resolvedPreferredGameSlug) ?? memberOptions[0] ?? null;

    setVersions(memberOptions);
    setSelectedGame(selected);
    setGame({
      id: rawSet.id,
      slug: rawSet.slug,
      name: rawSet.name,
      generation: rawSet.generation,
      releaseOrder: rawSet.release_order,
      scopeType: rawSet.scope_type,
      regionLabel: rawSet.region_label,
      parentSetId: rawSet.parent_set_id,
      description: rawSet.description,
      versions: memberOptions,
    });

    const allRows: RawEntry[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error: entryError } = await supabase
        .from('game_dex_set_entries')
        .select('set_id, species_id, dex_number, dex_slug, dex_name, dex_order, pokemon_species!inner(id, national_dex_number, name, slug)')
        .eq('set_id', rawSet.id)
        .order('dex_order', { ascending: true })
        .order('dex_number', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (entryError) { setError(entryError.message); setLoading(false); return; }
      const page = (data ?? []) as unknown as RawEntry[];
      allRows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const { data: exclusiveData, error: exclusiveError } = await supabase
      .from('game_dex_version_exclusives')
      .select('species_id, game_id')
      .eq('set_id', rawSet.id);
    if (exclusiveError) { setError(exclusiveError.message); setLoading(false); return; }
    const exclusiveBySpecies = new Map<number, number[]>();
    for (const row of (exclusiveData ?? []) as RawExclusive[]) {
      const list = exclusiveBySpecies.get(row.species_id) ?? [];
      list.push(row.game_id);
      exclusiveBySpecies.set(row.species_id, list);
    }

    // Multi-section Dexes (Kalos/Alola) can repeat a species. The first entry
    // becomes its display position, exactly as in v1.1.
    const baseBySpecies = new Map<number, GameDexCatalogEntry>();
    for (const row of allRows) {
      if (baseBySpecies.has(row.species_id)) continue;
      const species = Array.isArray(row.pokemon_species) ? row.pokemon_species[0] : row.pokemon_species;
      baseBySpecies.set(row.species_id, {
        setId: row.set_id,
        speciesId: row.species_id,
        dexNumber: row.dex_number ?? species.national_dex_number,
        dexSlug: row.dex_slug,
        dexName: row.dex_name,
        dexOrder: row.dex_order,
        nationalDexNumber: species.national_dex_number,
        speciesName: species.name,
        speciesSlug: species.slug,
        exclusiveGameIds: exclusiveBySpecies.get(row.species_id) ?? [],
        progressKey: baseKey(row.species_id),
        formId: null,
        formName: null,
        formSlug: null,
        formCategory: 'default',
        isDefaultForm: true,
        isBattleOnly: false,
        supportsPlaceholder: false,
        spriteUrl: null,
        shinySpriteUrl: null,
      });
    }

    let availableForms: Array<{ entry: GameDexCatalogEntry; formOrder: number }> = [];
    if (selected) {
      const formRows: RawAvailableForm[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: formError } = await supabase
          .from('game_form_availability')
          .select('form_id, pokemon_forms!inner(id, species_id, name, slug, form_category, form_order, is_battle_only, supports_placeholder, sprite_url, shiny_sprite_url)')
          .eq('game_id', selected.id)
          .range(from, from + PAGE_SIZE - 1);
        if (formError) { setError(formError.message); setLoading(false); return; }
        const page = (data ?? []) as unknown as RawAvailableForm[];
        formRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      availableForms = formRows.flatMap((row) => {
        const form = Array.isArray(row.pokemon_forms) ? row.pokemon_forms[0] : row.pokemon_forms;
        const base = form ? baseBySpecies.get(form.species_id) : null;
        if (!form || !base) return [];

        return [{
          formOrder: form.form_order,
          entry: {
            ...base,
            exclusiveGameIds: [],
            progressKey: formKey(form.id),
            formId: form.id,
            formName: form.name,
            formSlug: form.slug,
            formCategory: form.form_category,
            isDefaultForm: false,
            isBattleOnly: form.is_battle_only,
            supportsPlaceholder: form.supports_placeholder,
            spriteUrl: form.sprite_url,
            shinySpriteUrl: form.shiny_sprite_url,
          },
        }];
      });
    }

    const formsBySpecies = new Map<number, Array<{ entry: GameDexCatalogEntry; formOrder: number }>>();
    for (const form of availableForms) {
      const list = formsBySpecies.get(form.entry.speciesId) ?? [];
      list.push(form);
      formsBySpecies.set(form.entry.speciesId, list);
    }
    for (const list of formsBySpecies.values()) list.sort((a, b) => a.formOrder - b.formOrder || a.entry.formName!.localeCompare(b.entry.formName!));

    const combined: GameDexCatalogEntry[] = [];
    for (const base of baseBySpecies.values()) {
      combined.push(base);
      combined.push(...(formsBySpecies.get(base.speciesId) ?? []).map((item) => item.entry));
    }
    setAllCatalog(combined);

    if (!selected) { setProgress({}); setLoading(false); return; }

    const nextProgress: Record<string, GameDexEntryProgress> = {};
    if (user) {
      const baseRows: RawBaseProgress[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: progressError } = await supabase
          .from('game_collection_progress')
          .select('species_id, normal_owned, shiny_owned')
          .eq('user_id', user.id)
          .eq('game_id', selected.id)
          .order('species_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (progressError) { setError(progressError.message); setLoading(false); return; }
        const page = (data ?? []) as RawBaseProgress[];
        baseRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      const formRows: RawFormProgress[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: progressError } = await supabase
          .from('game_form_collection_progress')
          .select('form_id, normal_owned, shiny_owned')
          .eq('user_id', user.id)
          .eq('game_id', selected.id)
          .order('form_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (progressError) { setError(progressError.message); setLoading(false); return; }
        const page = (data ?? []) as RawFormProgress[];
        formRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      for (const row of baseRows) nextProgress[baseKey(row.species_id)] = { normalOwned: row.normal_owned, shinyOwned: row.shiny_owned };
      for (const row of formRows) nextProgress[formKey(row.form_id)] = { normalOwned: row.normal_owned, shinyOwned: row.shiny_owned };
    } else {
      for (const row of Object.values(gameProgress[selected.id] ?? {})) {
        nextProgress[baseKey(row.speciesId)] = { normalOwned: row.normalOwned, shinyOwned: row.shinyOwned };
      }
      for (const row of Object.values(gameFormProgress[selected.id] ?? {})) {
        nextProgress[formKey(row.formId)] = { normalOwned: row.normalOwned, shinyOwned: row.shinyOwned };
      }
    }

    setProgress(nextProgress);
    setLoading(false);
  }, [gameFormProgress, gameProgress, preferredGameSlug, setSlug, user]);

  useEffect(() => { void load(); }, [load]);

  const catalog = useMemo(
    () => allCatalog.filter((entry) => entry.formCategory === 'default' || categoryEnabled(entry.formCategory)),
    [allCatalog, categoryEnabled],
  );

  const availableFormCategoryCounts = useMemo(() => {
    const counts: Record<FormCategory, number> = {
      default: 0,
      regional: 0,
      alternate: 0,
      pattern: 0,
      gender: 0,
      battle: 0,
      special: 0,
    };
    for (const entry of allCatalog) counts[entry.formCategory] += 1;
    return counts;
  }, [allCatalog]);

  async function setCollectionState(entry: GameDexCatalogEntry, normalOwned: boolean, shinyOwned: boolean) {
    if (!supabase || !game || !selectedGame) return { error: 'Game Dex is not ready.' };
    const before = progress[entry.progressKey] ?? { normalOwned: false, shinyOwned: false };
    const next = { normalOwned, shinyOwned };
    setProgress((current) => ({ ...current, [entry.progressKey]: next }));

    if (!user) {
      if (entry.formId == null) setGameState(selectedGame.id, entry.speciesId, normalOwned, shinyOwned);
      else setGameFormState(selectedGame.id, entry.formId, normalOwned, shinyOwned);
      markGameDexStarted(game.id, selectedGame.id);
      return { error: null };
    }

    // Keep the two progress-table writes in explicit branches. Supabase's
    // generated overloads can then validate each payload instead of trying to
    // reconcile a union containing either species_id or form_id.
    const { error: saveError } = entry.formId == null
      ? await supabase.from('game_collection_progress').upsert({
          user_id: user.id,
          game_id: selectedGame.id,
          species_id: entry.speciesId,
          normal_owned: normalOwned,
          shiny_owned: shinyOwned,
        }, { onConflict: 'user_id,game_id,species_id' })
      : await supabase.from('game_form_collection_progress').upsert({
          user_id: user.id,
          game_id: selectedGame.id,
          form_id: entry.formId,
          normal_owned: normalOwned,
          shiny_owned: shinyOwned,
        }, { onConflict: 'user_id,game_id,form_id' });
    if (!saveError) {
      const { error: activityError } = await supabase.from('game_dex_activity').upsert({
        user_id: user.id,
        set_id: game.id,
        game_id: selectedGame.id,
        last_activity_at: new Date().toISOString(),
      }, { onConflict: 'user_id,set_id' });
      if (activityError) {
        setProgress((current) => ({ ...current, [entry.progressKey]: before }));
        return { error: activityError.message };
      }
    }

    if (saveError) {
      setProgress((current) => ({ ...current, [entry.progressKey]: before }));
      return { error: saveError.message };
    }
    return { error: null };
  }

  const stats = useMemo(() => ({
    total: catalog.length,
    livingOwned: catalog.filter((entry) => progress[entry.progressKey]?.normalOwned).length,
    shinyOwned: catalog.filter((entry) => progress[entry.progressKey]?.shinyOwned).length,
    optionalForms: catalog.filter((entry) => !entry.isDefaultForm).length,
    availableOptionalForms: Math.max(allCatalog.length - availableFormCategoryCounts.default, 0),
  }), [allCatalog.length, availableFormCategoryCounts.default, catalog, progress]);

  return {
    game,
    versions,
    selectedGame,
    catalog,
    allCatalog,
    progress,
    stats,
    availableFormCategoryCounts,
    loading,
    error,
    setCollectionState,
  };
}
