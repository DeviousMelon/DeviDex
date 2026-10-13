-- DeviDex v0.9 verification
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pokemon_forms'
  and column_name in (
    'form_category', 'pokeapi_form_id', 'source_pokemon_id',
    'form_identifier', 'is_battle_only', 'is_mega',
    'supports_placeholder', 'sprite_url', 'shiny_sprite_url'
  )
order by column_name;

select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'user_form_preferences') as preference_policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_form_preferences';

select form_category, form_count
from public.form_category_counts
order by form_category;
