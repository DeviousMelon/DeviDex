-- DeviDex v0.3 verification
-- Run after migrations/002_core_living_dex.sql and after using the Admin data importer.
select
  (select count(*) from public.pokemon_species) as species,
  (select count(*) from public.pokemon_forms) as forms,
  (select count(*) from public.pokemon_forms where is_trackable) as trackable_forms,
  (select count(*) from public.games) as games,
  (select count(*) from public.collection_progress) as saved_progress_rows;
