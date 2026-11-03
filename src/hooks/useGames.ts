import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { gamesById, loadGameDexSetRows, loadSetMemberRows } from '../lib/staticData';
import type { GameDexSetSummary, GameDexScopeType, GameVersionOption } from '../types';

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
  set_id: number;
  game_id: number;
  member_order: number;
  short_label: string | null;
  games:
    | { id: number; slug: string; name: string }
    | Array<{ id: number; slug: string; name: string }>;
};

/**
 * Phase 6A replaces the old one-card-per-version list with shared Game Dex sets.
 * Progress is still version-specific; this hook only describes the shared
 * catalogue containers and which real game saves can be selected inside them.
 */
export function useGames() {
  const [games, setGames] = useState<GameDexSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase) {
        setError('Supabase is not configured.');
        setLoading(false);
        return;
      }

      // The shared Game Dex tables are static files now (see lib/staticData.ts).
      let setRows: RawSet[];
      let memberRows: RawMember[];
      try {
        const [sets, members, games] = await Promise.all([loadGameDexSetRows(), loadSetMemberRows(), gamesById()]);
        setRows = sets
          .filter((row) => row.is_active !== false)
          .sort((a, b) => a.release_order - b.release_order) as unknown as RawSet[];
        memberRows = members
          .slice()
          .sort((a, b) => a.member_order - b.member_order)
          .flatMap((row) => {
            const game = games.get(row.game_id);
            return game ? [{ ...row, games: { id: game.id, slug: game.slug, name: game.name } }] : [];
          });
      } catch (staticError) {
        if (cancelled) return;
        setError(staticError instanceof Error ? staticError.message : 'Could not load shared Game Dexes.');
        setLoading(false);
        return;
      }

      if (cancelled) return;

      const membersBySet = new Map<number, GameVersionOption[]>();
      for (const row of memberRows) {
        const game = Array.isArray(row.games) ? row.games[0] : row.games;
        if (!game) continue;
        const list = membersBySet.get(row.set_id) ?? [];
        list.push({
          id: game.id,
          slug: game.slug,
          name: game.name,
          shortLabel: row.short_label || game.name.replace(/^Pokémon\s*/i, ''),
          memberOrder: row.member_order,
        });
        membersBySet.set(row.set_id, list);
      }

      setGames(setRows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        generation: row.generation,
        releaseOrder: row.release_order,
        scopeType: row.scope_type,
        regionLabel: row.region_label,
        parentSetId: row.parent_set_id,
        description: row.description,
        versions: (membersBySet.get(row.id) ?? []).sort((a, b) => a.memberOrder - b.memberOrder),
      })));
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return { games, loading, error };
}
