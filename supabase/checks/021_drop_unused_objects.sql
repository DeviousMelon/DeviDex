-- DeviDex v2.2 verification. Read-only. Every row should say ok = true.

select check_name, ok from (
  select 1 as n, 'game_dex_entries dropped' as check_name,
    to_regclass('public.game_dex_entries') is null as ok
  union all
  select 2, 'form_category_counts dropped',
    to_regclass('public.form_category_counts') is null
  union all
  select 3, 'replacement table game_dex_set_entries still there with data',
    to_regclass('public.game_dex_set_entries') is not null
    and exists (select 1 from public.game_dex_set_entries)
  union all
  select 4, 'pokemon_forms still readable',
    exists (select 1 from public.pokemon_forms)
) checks
order by n;
