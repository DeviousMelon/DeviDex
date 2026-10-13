import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import { useGuestProgress } from '../context/GuestProgressContext';
import { supabase } from '../lib/supabase';
import type { FormCategory, StartedGameDex } from '../types';

type RawActivity = { set_id: number; game_id: number; last_activity_at: string };
type RawSet = { id: number; slug: string; name: string; generation: number; release_order: number; scope_type: 'base' | 'dlc' | 'special' };
type RawGame = { id: number; slug: string; name: string };
type RawProgress = { game_id: number; species_id: number; normal_owned: boolean; shiny_owned: boolean };
type RawFormProgress = { game_id: number; form_id: number; normal_owned: boolean; shiny_owned: boolean };
type RawEntry = { set_id: number; species_id: number };
type RawAvailability = {
  game_id: number;
  form_id: number;
  pokemon_forms: { species_id: number; form_category: FormCategory } | Array<{ species_id: number; form_category: FormCategory }>;
};

/** Homepage helper for shared Game Dex activity, including Phase 6B forms. */
export function useStartedGameDexes() {
  const { user } = useAuth();
  const { categoryEnabled } = useFormPreferences();
  const { gameProgress, gameFormProgress, gameDexActivity } = useGuestProgress();
  const [startedGames, setStartedGames] = useState<StartedGameDex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      setLoading(true);

      let activities: RawActivity[] = [];
      if (user) {
        const { data, error } = await supabase.from('game_dex_activity').select('set_id, game_id, last_activity_at').eq('user_id', user.id).order('last_activity_at', { ascending: false });
        if (error) { console.error(error.message); setLoading(false); return; }
        activities = (data ?? []) as RawActivity[];
      } else {
        activities = Object.entries(gameDexActivity).map(([setId, gameId]) => ({ set_id: Number(setId), game_id: gameId, last_activity_at: '' }));
      }

      if (activities.length === 0) { if (!cancelled) { setStartedGames([]); setLoading(false); } return; }
      const setIds = [...new Set(activities.map((a) => a.set_id))];
      const gameIds = [...new Set(activities.map((a) => a.game_id))];
      const [setsResult, gamesResult, entriesResult] = await Promise.all([
        supabase.from('game_dex_sets').select('id, slug, name, generation, release_order, scope_type').in('id', setIds),
        supabase.from('games').select('id, slug, name').in('id', gameIds),
        supabase.from('game_dex_set_entries').select('set_id, species_id').in('set_id', setIds),
      ]);
      if (setsResult.error || gamesResult.error || entriesResult.error) { console.error(setsResult.error?.message ?? gamesResult.error?.message ?? entriesResult.error?.message); setLoading(false); return; }

      let progressRows: RawProgress[] = [];
      let formProgressRows: RawFormProgress[] = [];
      if (user) {
        const [baseResult, formResult] = await Promise.all([
          supabase.from('game_collection_progress').select('game_id, species_id, normal_owned, shiny_owned').eq('user_id', user.id).in('game_id', gameIds).or('normal_owned.eq.true,shiny_owned.eq.true'),
          supabase.from('game_form_collection_progress').select('game_id, form_id, normal_owned, shiny_owned').eq('user_id', user.id).in('game_id', gameIds).or('normal_owned.eq.true,shiny_owned.eq.true'),
        ]);
        if (baseResult.error || formResult.error) { console.error(baseResult.error?.message ?? formResult.error?.message); setLoading(false); return; }
        progressRows = (baseResult.data ?? []) as RawProgress[];
        formProgressRows = (formResult.data ?? []) as RawFormProgress[];
      } else {
        for (const gameId of gameIds) {
          for (const row of Object.values(gameProgress[gameId] ?? {})) progressRows.push({ game_id: gameId, species_id: row.speciesId, normal_owned: row.normalOwned, shiny_owned: row.shinyOwned });
          for (const row of Object.values(gameFormProgress[gameId] ?? {})) formProgressRows.push({ game_id: gameId, form_id: row.formId, normal_owned: row.normalOwned, shiny_owned: row.shinyOwned });
        }
      }

      const availabilityRows: RawAvailability[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase
          .from('game_form_availability')
          .select('game_id, form_id, pokemon_forms!inner(species_id, form_category)')
          .in('game_id', gameIds)
          .range(from, from + 499);
        if (error) { console.error(error.message); setLoading(false); return; }
        const page = (data ?? []) as unknown as RawAvailability[];
        availabilityRows.push(...page);
        if (page.length < 500) break;
      }

      const setById = new Map(((setsResult.data ?? []) as RawSet[]).map((s) => [s.id, s]));
      const gameById = new Map(((gamesResult.data ?? []) as RawGame[]).map((g) => [g.id, g]));
      const speciesBySet = new Map<number, Set<number>>();
      for (const row of (entriesResult.data ?? []) as RawEntry[]) {
        const species = speciesBySet.get(row.set_id) ?? new Set<number>();
        species.add(row.species_id);
        speciesBySet.set(row.set_id, species);
      }

      const availabilityByGame = new Map<number, Array<{ formId: number; speciesId: number; category: FormCategory }>>();
      for (const row of availabilityRows) {
        const form = Array.isArray(row.pokemon_forms) ? row.pokemon_forms[0] : row.pokemon_forms;
        if (!form || !categoryEnabled(form.form_category)) continue;
        const list = availabilityByGame.get(row.game_id) ?? [];
        list.push({ formId: row.form_id, speciesId: form.species_id, category: form.form_category });
        availabilityByGame.set(row.game_id, list);
      }

      const rows = activities.flatMap((activity) => {
        const set = setById.get(activity.set_id); const game = gameById.get(activity.game_id);
        if (!set || !game) return [];
        const valid = speciesBySet.get(set.id) ?? new Set<number>();
        const relevant = progressRows.filter((p) => p.game_id === game.id && valid.has(p.species_id));
        const validForms = (availabilityByGame.get(game.id) ?? []).filter((form) => valid.has(form.speciesId));
        const validFormIds = new Set(validForms.map((form) => form.formId));
        const relevantForms = formProgressRows.filter((p) => p.game_id === game.id && validFormIds.has(p.form_id));
        return [{
          id: set.id,
          slug: set.slug,
          name: set.name,
          generation: set.generation,
          releaseOrder: set.release_order,
          scopeType: set.scope_type,
          gameName: game.name,
          gameSlug: game.slug,
          livingOwned: relevant.filter((p) => p.normal_owned).length + relevantForms.filter((p) => p.normal_owned).length,
          shinyOwned: relevant.filter((p) => p.shiny_owned).length + relevantForms.filter((p) => p.shiny_owned).length,
          total: valid.size + validFormIds.size,
        } satisfies StartedGameDex];
      });
      if (!cancelled) { setStartedGames(rows); setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [categoryEnabled, gameDexActivity, gameFormProgress, gameProgress, user]);

  return { startedGames: useMemo(() => startedGames, [startedGames]), loading };
}
