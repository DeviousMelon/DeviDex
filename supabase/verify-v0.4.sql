-- DeviDex v0.4 quick verification
select 'games' as item, count(*)::bigint as total from public.games
union all
select 'game dex memberships', count(*)::bigint from public.game_dex_entries
union all
select 'game progress rows', count(*)::bigint from public.game_collection_progress;
