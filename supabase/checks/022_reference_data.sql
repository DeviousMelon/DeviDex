-- DeviDex v2.2 verification. Read-only. Every row should say ok = true.
-- The "imported" rows only pass after running the Reference data importer
-- on the Admin page; everything above them should pass straight after the SQL.

with ref_tables(t) as (
  values ('ref_types'), ('ref_type_efficacy'), ('ref_type_efficacy_past'), ('ref_version_groups'),
         ('ref_egg_groups'), ('ref_natures'), ('ref_abilities'), ('ref_moves'), ('ref_items'),
         ('ref_species'), ('ref_pokemon'), ('ref_pokemon_types_past'), ('ref_pokemon_moves')
)
select check_name, ok
from (
  select 1 as n, 'all 13 reference tables exist' as check_name,
    (select count(*) from ref_tables where to_regclass('public.' || t) is not null) = 13 as ok
  union all
  select 2, 'RLS on every reference table',
    (select bool_and(c.relrowsecurity) from ref_tables join pg_class c on c.oid = ('public.' || t)::regclass)
  union all
  select 3, 'visitors can read reference tables',
    (select bool_and(has_table_privilege('anon', 'public.' || t, 'SELECT')) from ref_tables)
  union all
  select 4, 'visitors cannot write reference tables',
    (select bool_and(not has_table_privilege('anon', 'public.' || t, 'INSERT')
                 and not has_table_privilege('anon', 'public.' || t, 'UPDATE')
                 and not has_table_privilege('anon', 'public.' || t, 'DELETE')) from ref_tables)
  union all
  select 5, 'four policies per table (read + admin insert/update/delete)',
    (select bool_and(cnt = 4) from (
       select t, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t) as cnt
       from ref_tables) x)
  union all
  select 6, 'admin policies use fast (select is_admin()) form',
    not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename like 'ref\_%'
        and replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'SELECT is_admin()', '') like '%is_admin()%')
  union all
  select 7, 'ref_form_pokemon view is security_invoker',
    coalesce((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.ref_form_pokemon'::regclass), false)
  union all
  select 8, 'visitors can read ref_form_pokemon',
    has_table_privilege('anon', 'public.ref_form_pokemon', 'SELECT')
  union all
  select 9, 'reverse move search index exists',
    to_regclass('public.ref_pokemon_moves_move_idx') is not null
  -- ---- After the Admin page import ----
  union all
  select 10, 'imported: 18 types have a full 18x18 chart',
    (select count(*) from public.ref_type_efficacy e
       join public.ref_types a on a.id = e.attacking_type_id and a.id <= 18
       join public.ref_types d on d.id = e.defending_type_id and d.id <= 18) = 324
  union all
  select 11, 'imported: 25 natures',
    (select count(*) from public.ref_natures) = 25
  union all
  select 12, 'imported: every National Dex species has species data',
    not exists (select 1 from public.pokemon_species s
                where not exists (select 1 from public.ref_species r where r.species_id = s.id))
  union all
  select 13, 'imported: every National Dex species has a default Pokémon',
    not exists (select 1 from public.pokemon_species s
                where not exists (select 1 from public.ref_pokemon p where p.species_id = s.id and p.is_default))
  union all
  select 14, 'imported: learnsets present',
    (select count(*) from public.ref_pokemon_moves) > 100000
  union all
  select 15, 'imported: spot check, Bulbasaur is Grass/Poison with catch rate 45',
    exists (select 1 from public.ref_pokemon p
            join public.ref_types t1 on t1.id = p.type1_id and t1.slug = 'grass'
            join public.ref_types t2 on t2.id = p.type2_id and t2.slug = 'poison'
            join public.ref_species s on s.species_id = p.species_id and s.capture_rate = 45
            where p.id = 1)
) checks
order by n;
