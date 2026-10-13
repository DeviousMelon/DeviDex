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
