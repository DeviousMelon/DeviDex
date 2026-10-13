-- DeviDex v1.2 verification. Read-only.
select
  to_regclass('public.game_form_availability') as game_form_availability,
  to_regclass('public.game_form_collection_progress') as game_form_collection_progress;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('game_form_availability', 'game_form_collection_progress')
order by tablename;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('export_own_collection_v4', 'restore_own_collection_v4')
order by routine_name;

select
  (select count(*) from public.game_form_availability) as availability_rows,
  (select count(*) from public.pokemon_forms where is_trackable and not is_default) as optional_form_rows;

select pf.form_category, count(*) as available_pairs
from public.game_form_availability a
join public.pokemon_forms pf on pf.id = a.form_id
group by pf.form_category
order by pf.form_category;
