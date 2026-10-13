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
