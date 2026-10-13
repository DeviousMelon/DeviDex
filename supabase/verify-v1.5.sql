-- DeviDex v1.5 has no schema migration.
-- This optional sanity check confirms the catalogue structures consumed by
-- Pokémon pages and National Dex search still exist and contain data.
select
  (select count(*) from public.pokemon_species) as species_count,
  (select count(*) from public.pokemon_forms where is_trackable = true) as trackable_form_count,
  (select count(*) from public.games) as game_count;
