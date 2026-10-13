-- DeviDex v1.1 verification. These are read-only checks.
select 'shared dex sets' as check_name, count(*)::bigint as value from public.game_dex_sets
union all
select 'shared dex members', count(*)::bigint from public.game_dex_set_members
union all
select 'shared dex entries', count(*)::bigint from public.game_dex_set_entries
union all
select 'curated exclusives', count(*)::bigint from public.game_dex_version_exclusives
union all
select 'activity rows', count(*)::bigint from public.game_dex_activity;

select slug, name, scope_type, source_pokedex_slugs
from public.game_dex_sets
order by release_order, slug;

select ds.slug as dex_set, g.slug as game, count(*) as exclusive_flags
from public.game_dex_version_exclusives x
join public.game_dex_sets ds on ds.id = x.set_id
join public.games g on g.id = x.game_id
group by ds.slug, g.slug
order by ds.slug, g.slug;

select relname, relrowsecurity
from pg_class
where relname in (
  'game_dex_sets',
  'game_dex_set_members',
  'game_dex_set_entries',
  'game_dex_version_exclusives',
  'game_dex_activity'
)
order by relname;
