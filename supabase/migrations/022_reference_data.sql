-- =============================================================
-- DeviDex v2.2 - reference data foundation
--
-- Shared, read-only game data that the calculators, type chart, breeding
-- tools and reverse move search all need to QUERY across many Pokémon at once
-- ("who can pass down Wish as an egg move?"). Single-Pokémon detail pages keep
-- fetching PokéAPI on demand exactly as before; this does not replace that.
--
-- Everything here is public to read and admin-only to write, filled from the
-- Admin page ("Reference data importer"), the same way as the National Dex.
-- No user data lives in these tables, so re-syncing can never touch saves.
--
-- Run after v2.1.1. Safe to rerun. Then run checks/022_reference_data.sql.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Small lookup tables
-- -------------------------------------------------------------
-- Ids are PokéAPI's own ids, so imports can upsert by primary key and old
-- PokéAPI links keep working. Only the real types (1-18, plus Stellar) are
-- stored; PokéAPI's "unknown" and "shadow" (ids 10000+) are left out.
create table if not exists public.ref_types (
  id smallint primary key,
  slug text not null unique,
  name text not null,
  generation smallint not null,
  -- Before Gen 4 a move's type decided physical/special. Null for Fairy and
  -- Stellar, which arrived after the split.
  legacy_damage_class text check (legacy_damage_class in ('physical', 'special'))
);

-- Current type chart. damage_factor is a percentage: 0, 50, 100 or 200.
create table if not exists public.ref_type_efficacy (
  attacking_type_id smallint not null references public.ref_types(id) on delete cascade,
  defending_type_id smallint not null references public.ref_types(id) on delete cascade,
  damage_factor smallint not null check (damage_factor in (0, 50, 100, 200)),
  primary key (attacking_type_id, defending_type_id)
);

-- Older type charts. A row means "this matchup used damage_factor up to and
-- including until_generation" (e.g. Ghost vs Psychic was 0 in Gen 1).
create table if not exists public.ref_type_efficacy_past (
  attacking_type_id smallint not null references public.ref_types(id) on delete cascade,
  defending_type_id smallint not null references public.ref_types(id) on delete cascade,
  until_generation smallint not null,
  damage_factor smallint not null check (damage_factor in (0, 50, 100, 200)),
  primary key (attacking_type_id, defending_type_id, until_generation)
);

-- Version groups are PokéAPI's "red-blue", "scarlet-violet"... the unit that
-- learnsets are recorded against. src/lib/gameContext.ts already maps these
-- to real save versions, so no game ids are duplicated here.
create table if not exists public.ref_version_groups (
  id smallint primary key,
  slug text not null unique,
  generation smallint not null,
  sort_order smallint not null
);

create table if not exists public.ref_egg_groups (
  id smallint primary key,
  slug text not null unique,
  name text not null
);

-- Neutral natures (Hardy, Docile...) store null for both stats, so a stat
-- calculator never has to special-case "boosts and lowers the same stat".
create table if not exists public.ref_natures (
  id smallint primary key,
  slug text not null unique,
  name text not null,
  increased_stat text check (increased_stat in ('attack', 'defense', 'special-attack', 'special-defense', 'speed')),
  decreased_stat text check (decreased_stat in ('attack', 'defense', 'special-attack', 'special-defense', 'speed')),
  check ((increased_stat is null) = (decreased_stat is null))
);

create table if not exists public.ref_abilities (
  id smallint primary key,
  slug text not null unique,
  name text not null,
  generation smallint not null,
  is_main_series boolean not null default true
);

-- Shadow moves (Colosseum/XD, ids 10000+) are left out with the Shadow type.
create table if not exists public.ref_moves (
  id smallint primary key,
  slug text not null unique,
  name text not null,
  generation smallint not null,
  type_id smallint not null references public.ref_types(id),
  damage_class text not null check (damage_class in ('physical', 'special', 'status')),
  power smallint,
  pp smallint,
  accuracy smallint,
  priority smallint not null default 0,
  target text not null,
  effect_chance smallint
);

create index if not exists ref_moves_type_idx on public.ref_moves (type_id);

-- Item slugs are NOT unique: PokéAPI has two Roseli Berry rows (ids 723 and
-- 2279), so items are only unique by id.
create table if not exists public.ref_items (
  id integer primary key,
  slug text not null,
  name text not null,
  category text not null,
  cost integer not null default 0,
  fling_power smallint
);

create index if not exists ref_items_slug_idx on public.ref_items (slug);
create index if not exists ref_items_category_idx on public.ref_items (category);

-- -------------------------------------------------------------
-- 2. Species-level data (catch rate, breeding)
-- -------------------------------------------------------------
-- One row per National Dex species, alongside pokemon_species rather than
-- inside it, so the existing National Dex importer stays exactly as it is.
create table if not exists public.ref_species (
  species_id integer primary key references public.pokemon_species(id) on delete cascade,
  capture_rate smallint not null check (capture_rate between 0 and 255),
  base_happiness smallint,
  -- Eighths female: 0 = always male, 8 = always female, -1 = genderless.
  gender_rate smallint not null check (gender_rate between -1 and 8),
  -- Egg cycles. Steps to hatch depend on the game, so the raw cycles are kept.
  hatch_counter smallint,
  growth_rate text not null,
  egg_group_ids smallint[] not null default '{}',
  evolves_from_species_id integer,
  is_baby boolean not null default false,
  has_gender_differences boolean not null default false,
  forms_switchable boolean not null default false
);

create index if not exists ref_species_egg_groups_idx on public.ref_species using gin (egg_group_ids);

-- -------------------------------------------------------------
-- 3. Battle data per Pokémon variety
-- -------------------------------------------------------------
-- Keyed by PokéAPI Pokémon id: 1-1025 are the default varieties, 10001+ are
-- regional forms, Megas, G-Max and so on. pokemon_forms.source_pokemon_id
-- points here (null on base slots, where the id is the species id); the
-- ref_form_pokemon view below does that lookup for you.
create table if not exists public.ref_pokemon (
  id integer primary key,
  species_id integer not null references public.pokemon_species(id) on delete cascade,
  slug text not null unique,
  is_default boolean not null default false,
  type1_id smallint not null references public.ref_types(id),
  type2_id smallint references public.ref_types(id),
  hp smallint not null,
  attack smallint not null,
  defense smallint not null,
  special_attack smallint not null,
  special_defense smallint not null,
  speed smallint not null,
  ability1_id smallint references public.ref_abilities(id),
  ability2_id smallint references public.ref_abilities(id),
  hidden_ability_id smallint references public.ref_abilities(id),
  height smallint,           -- decimetres
  weight integer,            -- hectograms (Low Kick / Heavy Slam use this)
  base_experience smallint
);

create index if not exists ref_pokemon_species_idx on public.ref_pokemon (species_id);
create index if not exists ref_pokemon_types_idx on public.ref_pokemon (type1_id, type2_id);

-- Typings that changed: Clefairy was pure Normal up to and including Gen 5.
create table if not exists public.ref_pokemon_types_past (
  pokemon_id integer not null references public.ref_pokemon(id) on delete cascade,
  until_generation smallint not null,
  type1_id smallint not null references public.ref_types(id),
  type2_id smallint references public.ref_types(id),
  primary key (pokemon_id, until_generation)
);

-- Learnsets. PokéAPI has ~640k rows (one per game); identical rows are folded
-- into one with the list of version groups they apply to, which is ~160k rows.
-- level is 0 for anything that isn't level-up.
create table if not exists public.ref_pokemon_moves (
  pokemon_id integer not null references public.ref_pokemon(id) on delete cascade,
  move_id smallint not null references public.ref_moves(id) on delete cascade,
  learn_method text not null,
  level smallint not null default 0,
  version_group_ids smallint[] not null,
  primary key (pokemon_id, move_id, learn_method, level)
);

-- Reverse search: "who learns X (by method Y)".
create index if not exists ref_pokemon_moves_move_idx on public.ref_pokemon_moves (move_id, learn_method);

-- -------------------------------------------------------------
-- 4. Form → battle data lookup
-- -------------------------------------------------------------
-- security_invoker so the view obeys the caller's RLS instead of the owner's.
create or replace view public.ref_form_pokemon
with (security_invoker = true) as
select
  f.id as form_id,
  f.slug as form_slug,
  f.species_id,
  coalesce(f.source_pokemon_id, f.species_id) as pokemon_id
from public.pokemon_forms f;

-- -------------------------------------------------------------
-- 5. Permissions: anyone reads, only admins write
-- -------------------------------------------------------------
-- Same shape as v2.1: split insert/update/delete admin policies that call
-- is_admin() once per query. The read policy never mentions is_admin(), so
-- signed-out visitors can read without hitting "permission denied".
do $$
declare
  t text;
begin
  foreach t in array array[
    'ref_types', 'ref_type_efficacy', 'ref_type_efficacy_past', 'ref_version_groups',
    'ref_egg_groups', 'ref_natures', 'ref_abilities', 'ref_moves', 'ref_items',
    'ref_species', 'ref_pokemon', 'ref_pokemon_types_past', 'ref_pokemon_moves'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', 'Anyone can read ' || t, t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   'Anyone can read ' || t, t);

    execute format('drop policy if exists %I on public.%I', 'Admins can manage ' || t || ' (insert)', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
                   'Admins can manage ' || t || ' (insert)', t);

    execute format('drop policy if exists %I on public.%I', 'Admins can manage ' || t || ' (update)', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   'Admins can manage ' || t || ' (update)', t);

    execute format('drop policy if exists %I on public.%I', 'Admins can manage ' || t || ' (delete)', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
                   'Admins can manage ' || t || ' (delete)', t);
  end loop;
end
$$;

revoke all on public.ref_form_pokemon from anon, authenticated;
grant select on public.ref_form_pokemon to anon, authenticated;
