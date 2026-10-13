-- =============================================================
-- DeviDex v0.9 - Phase 4: Forms foundation
--
-- Adds richer form metadata and per-user form-category preferences.
-- Safe to run after v0.8. It does NOT change the working account/profile
-- save path from v0.7.2.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Richer metadata for collection form slots
-- -------------------------------------------------------------
alter table public.pokemon_forms
  add column if not exists form_category text not null default 'default',
  add column if not exists pokeapi_form_id integer,
  add column if not exists source_pokemon_id integer,
  add column if not exists form_identifier text,
  add column if not exists is_battle_only boolean not null default false,
  add column if not exists is_mega boolean not null default false,
  add column if not exists supports_placeholder boolean not null default false,
  add column if not exists sprite_url text,
  add column if not exists shiny_sprite_url text;

-- Existing National Dex rows are the base/default species slots.
update public.pokemon_forms
set form_category = 'default',
    is_battle_only = false,
    is_mega = false,
    supports_placeholder = false
where is_default = true;

-- If an older build already had manually enabled alternate rows, do not leave
-- them accidentally classified as base species just because this column is new.
update public.pokemon_forms
set form_category = 'alternate'
where is_default = false and form_category = 'default';

-- Keep the allowed categories deliberately small and meaningful. More can be
-- added later without changing collection-progress rows.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pokemon_forms_category_check'
      and conrelid = 'public.pokemon_forms'::regclass
  ) then
    alter table public.pokemon_forms
      add constraint pokemon_forms_category_check
      check (form_category in (
        'default',
        'regional',
        'alternate',
        'pattern',
        'gender',
        'battle',
        'special'
      ));
  end if;
end
$$;

create unique index if not exists pokemon_forms_pokeapi_form_id_unique
  on public.pokemon_forms(pokeapi_form_id)
  where pokeapi_form_id is not null;

create index if not exists pokemon_forms_category_idx
  on public.pokemon_forms(form_category, form_order);

-- -------------------------------------------------------------
-- 2. Per-user form-category preferences
-- -------------------------------------------------------------
-- Base species are always included, so there is no include_default column.
-- Every optional category starts OFF. This preserves the familiar 1,025-slot
-- National Dex until the collector chooses what else counts for them.
create table if not exists public.user_form_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  include_regional boolean not null default false,
  include_alternate boolean not null default false,
  include_pattern boolean not null default false,
  include_gender boolean not null default false,
  include_battle boolean not null default false,
  include_special boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_form_preferences enable row level security;

-- Reuse the existing helper created by the core schema.
drop trigger if exists user_form_preferences_set_updated_at on public.user_form_preferences;
create trigger user_form_preferences_set_updated_at
before update on public.user_form_preferences
for each row execute procedure public.set_updated_at();

drop policy if exists "Users can read own form preferences" on public.user_form_preferences;
create policy "Users can read own form preferences"
on public.user_form_preferences for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own form preferences" on public.user_form_preferences;
create policy "Users can insert own form preferences"
on public.user_form_preferences for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own form preferences" on public.user_form_preferences;
create policy "Users can update own form preferences"
on public.user_form_preferences for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own form preferences" on public.user_form_preferences;
create policy "Users can delete own form preferences"
on public.user_form_preferences for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_form_preferences to authenticated;

-- Master form metadata remains public-readable and admin-writable under the
-- policies already installed by the core Living Dex schema.
grant select on public.pokemon_forms to anon, authenticated;

-- -------------------------------------------------------------
-- 3. Small helper view for admin verification / future tooling
-- -------------------------------------------------------------
create or replace view public.form_category_counts
with (security_invoker = true)
as
select form_category, count(*)::bigint as form_count
from public.pokemon_forms
where is_trackable = true
group by form_category;

grant select on public.form_category_counts to anon, authenticated;

-- -------------------------------------------------------------
-- 4. Public collection summaries must respect each user's form rules
-- -------------------------------------------------------------
-- Without this replacement, importing optional forms would make every public
-- profile suddenly claim a much larger denominator even when that collector
-- still uses a base-species-only Dex.
create or replace function public.get_public_collection_summary(candidate text)
returns table (
  living_owned bigint,
  shiny_owned bigint,
  trackable_total bigint,
  started_game_dexes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select p.id
    from public.profiles p
    where p.username is not null
      and p.profile_public = true
      and p.collection_public = true
      and lower(p.username) = lower(btrim(candidate))
    limit 1
  ),
  prefs as (
    select
      t.id,
      coalesce(fp.include_regional, false) as regional,
      coalesce(fp.include_alternate, false) as alternate,
      coalesce(fp.include_pattern, false) as pattern,
      coalesce(fp.include_gender, false) as gender,
      coalesce(fp.include_battle, false) as battle,
      coalesce(fp.include_special, false) as special
    from target t
    left join public.user_form_preferences fp on fp.user_id = t.id
  ),
  eligible_forms as (
    select f.id
    from public.pokemon_forms f
    cross join prefs p
    where f.is_trackable = true
      and (
        f.form_category = 'default'
        or (f.form_category = 'regional' and p.regional)
        or (f.form_category = 'alternate' and p.alternate)
        or (f.form_category = 'pattern' and p.pattern)
        or (f.form_category = 'gender' and p.gender)
        or (f.form_category = 'battle' and p.battle)
        or (f.form_category = 'special' and p.special)
      )
  ),
  totals as (
    select count(*)::bigint as trackable_total from eligible_forms
  ),
  national as (
    select
      count(*) filter (where cp.normal_owned)::bigint as living_owned,
      count(*) filter (where cp.shiny_owned)::bigint as shiny_owned
    from public.collection_progress cp
    join target t on t.id = cp.user_id
    join eligible_forms ef on ef.id = cp.form_id
  ),
  games as (
    select count(distinct gp.game_id)::bigint as started_game_dexes
    from public.game_collection_progress gp
    join target t on t.id = gp.user_id
    where gp.normal_owned = true or gp.shiny_owned = true
  )
  select
    coalesce(n.living_owned, 0),
    coalesce(n.shiny_owned, 0),
    totals.trackable_total,
    coalesce(g.started_game_dexes, 0)
  from target
  cross join totals
  cross join national n
  cross join games g;
$$;

revoke all on function public.get_public_collection_summary(text) from public;
grant execute on function public.get_public_collection_summary(text) to anon, authenticated;
