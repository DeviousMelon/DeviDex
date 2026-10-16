-- Since v2.2, game_dex_entries no longer exists, so the "game dex memberships"
-- line below errors. That's expected; check game_dex_set_entries instead.

-- DeviDex v0.4 quick verification
select 'games' as item, count(*)::bigint as total from public.games
union all
select 'game dex memberships', count(*)::bigint from public.game_dex_entries
union all
select 'game progress rows', count(*)::bigint from public.game_collection_progress;
