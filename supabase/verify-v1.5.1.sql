-- DeviDex v1.5.1 read-only sanity check.
-- There is NO v1.5.1 migration. This simply confirms the existing catalogue
-- and Game Dex structures v1.5.1 expects are still present.

select 'pokemon_species' as object, count(*) as rows from public.pokemon_species
union all
select 'pokemon_forms', count(*) from public.pokemon_forms
union all
select 'games', count(*) from public.games
union all
select 'game_dex_sets', count(*) from public.game_dex_sets
union all
select 'game_dex_set_members', count(*) from public.game_dex_set_members;
