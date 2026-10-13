-- Catalogue sanity check. Read-only.
-- Confirms the Pokémon catalogue tables the app relies on exist and have data.
-- Covers the releases that changed the app but needed no migration
-- (built locally as v1.3, v1.4, v1.5 and v1.5.1).

-- ---- from the v1.3 check ----
-- DeviDex v1.3 has no migration. This optional query only confirms the
-- existing catalogue pieces required by the new information pages.

select
  to_regclass('public.pokemon_species') is not null as pokemon_species_exists,
  to_regclass('public.pokemon_forms') is not null as pokemon_forms_exists;

select
  count(*) as species_rows
from public.pokemon_species;

select
  count(*) filter (where is_trackable = true) as trackable_form_rows,
  count(*) filter (where source_pokemon_id is not null) as forms_with_source_pokemon
from public.pokemon_forms;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pokemon_forms'
  and column_name in (
    'form_category',
    'source_pokemon_id',
    'is_battle_only',
    'supports_placeholder',
    'sprite_url',
    'shiny_sprite_url'
  )
order by column_name;

-- ---- from the v1.4 check ----
-- DeviDex v1.4 has no migration. This optional query confirms the existing
-- catalogue prerequisites used by the Pokémon + evolution information page.

select
  to_regclass('public.pokemon_species') is not null as pokemon_species_exists,
  to_regclass('public.pokemon_forms') is not null as pokemon_forms_exists;

select
  count(*) as species_rows
from public.pokemon_species;

select
  count(*) filter (where is_trackable = true) as trackable_form_rows,
  count(*) filter (where source_pokemon_id is not null) as forms_with_source_pokemon
from public.pokemon_forms;

-- ---- from the v1.5 check ----
-- DeviDex v1.5 has no schema migration.
-- This optional sanity check confirms the catalogue structures consumed by
-- Pokémon pages and National Dex search still exist and contain data.
select
  (select count(*) from public.pokemon_species) as species_count,
  (select count(*) from public.pokemon_forms where is_trackable = true) as trackable_form_count,
  (select count(*) from public.games) as game_count;

-- ---- from the v1.5.1 check ----
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
