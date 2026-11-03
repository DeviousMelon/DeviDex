import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useGuestProgress } from '../context/GuestProgressContext';
import { supabase } from '../lib/supabase';
import {
  formsById,
  gamesById,
  loadAvailabilityRows,
  loadExclusiveRows,
  loadGameDexSetRows,
  loadSetEntryRows,
  loadSetMemberRows,
  speciesById,
} from '../lib/staticData';
import { useOrderedSaves } from '../lib/orderedSaves';
import { clearProgressRow } from '../lib/progressRows';
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
  const runOrderedSave = useOrderedSaves<GameDexEntryProgress>();
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

    // The shared Game Dex tables are static files now (see lib/staticData.ts).
    let sets: Awaited<ReturnType<typeof loadGameDexSetRows>>;
    let games: Awaited<ReturnType<typeof gamesById>>;
    let species: Awaited<ReturnType<typeof speciesById>>;
    let members: Awaited<ReturnType<typeof loadSetMemberRows>>;
    let entries: Awaited<ReturnType<typeof loadSetEntryRows>>;
    let exclusives: Awaited<ReturnType<typeof loadExclusiveRows>>;
    try {
      [sets, games, species, members, entries, exclusives] = await Promise.all([
        loadGameDexSetRows(),
        gamesById(),
        speciesById(),
        loadSetMemberRows(),
        loadSetEntryRows(),
        loadExclusiveRows(),
      ]);
    } catch (staticError) {
      setError(staticError instanceof Error ? staticError.message : 'Couldn’t load the Game Dex data.');
      setLoading(false);
      return;
    }

    let setData: RawSet | null = (sets.find((row) => row.slug === setSlug) as RawSet | undefined) ?? null;

    // Keep every old /games/scarlet-style bookmark alive after the shared-Dex
    // rebuild. The matching version is selected when possible.
    if (!setData) {
      const legacyGame = [...games.values()].find((row) => row.slug === setSlug);
      if (legacyGame) {
        resolvedPreferredGameSlug = resolvedPreferredGameSlug ?? setSlug;
        const memberSetIds = new Set(members.filter((row) => row.game_id === legacyGame.id).map((row) => row.set_id));
        const base = sets
          .filter((row) => memberSetIds.has(row.id))
          .sort((a, b) => (a.scope_type === 'base' ? -1 : 1) - (b.scope_type === 'base' ? -1 : 1))[0];
        setData = (base as RawSet | undefined) ?? null;
      }
    }

    if (!setData) {
      setError('That shared Game Dex does not exist in DeviDex.');
      setLoading(false);
      return;
    }

    const rawSet = setData;
    const memberData: RawMember[] = members
      .filter((row) => row.set_id === rawSet.id)
      .sort((a, b) => a.member_order - b.member_order)
      .flatMap((row) => {
        const g = games.get(row.game_id);
        return g ? [{ game_id: row.game_id, member_order: row.member_order, short_label: row.short_label, games: { id: g.id, slug: g.slug, name: g.name } }] : [];
      });

    const memberOptions: GameVersionOption[] = memberData.flatMap((row) => {
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

    // Same order the old query asked for: dex_order, then dex_number.
    const allRows: RawEntry[] = entries
      .filter((row) => row.set_id === rawSet.id)
      .sort((a, b) => a.dex_order - b.dex_order || (a.dex_number ?? 0) - (b.dex_number ?? 0))
      .flatMap((row) => {
        const s = species.get(row.species_id);
        return s ? [{ ...row, pokemon_species: { id: s.id, national_dex_number: s.national_dex_number, name: s.name, slug: s.slug } }] : [];
      });

    const exclusiveBySpecies = new Map<number, number[]>();
    for (const row of exclusives.filter((item) => item.set_id === rawSet.id) as RawExclusive[]) {
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
      let formRows: RawAvailableForm[];
      try {
        const [availability, forms] = await Promise.all([loadAvailabilityRows(), formsById()]);
        formRows = availability
          .filter((row) => row.game_id === selected.id)
          .flatMap((row) => {
            const form = forms.get(row.form_id);
            return form ? [{ form_id: row.form_id, pokemon_forms: form as unknown as RawAvailableForm['pokemon_forms'] }] : [];
          });
      } catch (formError) {
        setError(formError instanceof Error ? formError.message : 'Couldn’t load this game’s forms.');
        setLoading(false);
        return;
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

    const client = supabase;
    const userId = user.id;
    const gameId = selectedGame.id;
    const setId = game.id;

    return runOrderedSave(
      `${gameId}:${entry.progressKey}`,
      before,
      next,
      async () => {
        // Keep the two progress-table writes in explicit branches. Supabase's
        // generated overloads can then validate each payload instead of trying to
        // reconcile a union containing either species_id or form_id.
        // Not owned at all = no row. Rows with a note are kept but marked
        // unowned, so a note is never lost and nothing reappears ticked.
        const nothingOwned = !normalOwned && !shinyOwned;
        const { error: saveError } = entry.formId == null
          ? nothingOwned
            ? await clearProgressRow(client, 'game_collection_progress', {
                user_id: userId,
                game_id: gameId,
                species_id: entry.speciesId,
              })
            : await client.from('game_collection_progress').upsert({
                user_id: userId,
                game_id: gameId,
                species_id: entry.speciesId,
                normal_owned: normalOwned,
                shiny_owned: shinyOwned,
              }, { onConflict: 'user_id,game_id,species_id' })
          : nothingOwned
            ? await clearProgressRow(client, 'game_form_collection_progress', {
                user_id: userId,
                game_id: gameId,
                form_id: entry.formId,
              })
            : await client.from('game_form_collection_progress').upsert({
                user_id: userId,
                game_id: gameId,
                form_id: entry.formId,
                normal_owned: normalOwned,
                shiny_owned: shinyOwned,
              }, { onConflict: 'user_id,game_id,form_id' });
        if (saveError) return { error: saveError.message };

        // The "last played" timestamp is a nice-to-have. The progress above is
        // already saved, so a failure here must not untick the tile.
        const { error: activityError } = await client.from('game_dex_activity').upsert({
          user_id: userId,
          set_id: setId,
          game_id: gameId,
          last_activity_at: new Date().toISOString(),
        }, { onConflict: 'user_id,set_id' });
        if (activityError) console.warn('Could not update Game Dex activity:', activityError.message);

        return { error: null };
      },
      (confirmedState) => setProgress((current) => ({ ...current, [entry.progressKey]: confirmedState })),
    );
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
