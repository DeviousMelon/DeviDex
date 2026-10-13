-- =============================================================
-- DeviDex v1.0 - Phase 5: Collection presets + saved setups
--
-- This migration adds named collection DEFINITIONS. It deliberately does not
-- duplicate or move collection_progress rows. A Pokémon owned by the user is
-- shared across every view; each view only changes what counts and which goal
-- (Living, Shiny, or both) is used for completion.
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- 1. Saved collection definitions
-- -------------------------------------------------------------
create table if not exists public.user_collection_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  preset_id text not null default 'standard'
    check (preset_id in ('standard', 'forms', 'gender-forms', 'shiny', 'shiny-forms', 'battle-forms', 'everything', 'custom')),
  goal text not null default 'living'
    check (goal in ('living', 'shiny', 'both')),
  include_regional boolean not null default false,
  include_alternate boolean not null default false,
  include_pattern boolean not null default false,
  include_gender boolean not null default false,
  include_battle boolean not null default false,
  include_special boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_collection_views_name_length check (char_length(btrim(name)) between 1 and 40)
);

alter table public.user_collection_views enable row level security;

create unique index if not exists user_collection_views_name_ci_unique
  on public.user_collection_views(user_id, lower(btrim(name)));

-- PostgreSQL enforces at most one active saved setup for each account.
create unique index if not exists user_collection_views_one_active_per_user
  on public.user_collection_views(user_id)
  where is_active = true;

create index if not exists user_collection_views_user_created_idx
  on public.user_collection_views(user_id, created_at);

drop trigger if exists user_collection_views_set_updated_at on public.user_collection_views;
create trigger user_collection_views_set_updated_at
before update on public.user_collection_views
for each row execute procedure public.set_updated_at();

drop policy if exists "Users can read own collection views" on public.user_collection_views;
create policy "Users can read own collection views"
on public.user_collection_views for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own collection views" on public.user_collection_views;
create policy "Users can insert own collection views"
on public.user_collection_views for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own collection views" on public.user_collection_views;
create policy "Users can update own collection views"
on public.user_collection_views for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own collection views" on public.user_collection_views;
create policy "Users can delete own collection views"
on public.user_collection_views for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_collection_views to authenticated;

-- -------------------------------------------------------------
-- 2. Migrate every existing user into one safe Main Collection
-- -------------------------------------------------------------
-- The v0.9 form preferences are copied exactly. Nobody's definition is reset
-- just because Phase 5 exists now.
insert into public.user_collection_views (
  user_id,
  name,
  preset_id,
  goal,
  include_regional,
  include_alternate,
  include_pattern,
  include_gender,
  include_battle,
  include_special,
  is_active
)
select
  p.id,
  'Main Collection',
  case
    when not coalesce(fp.include_regional, false)
     and not coalesce(fp.include_alternate, false)
     and not coalesce(fp.include_pattern, false)
     and not coalesce(fp.include_gender, false)
     and not coalesce(fp.include_battle, false)
     and not coalesce(fp.include_special, false)
      then 'standard'
    when coalesce(fp.include_regional, false)
     and coalesce(fp.include_alternate, false)
     and coalesce(fp.include_pattern, false)
     and not coalesce(fp.include_gender, false)
     and not coalesce(fp.include_battle, false)
     and not coalesce(fp.include_special, false)
      then 'forms'
    when coalesce(fp.include_regional, false)
     and coalesce(fp.include_alternate, false)
     and coalesce(fp.include_pattern, false)
     and coalesce(fp.include_gender, false)
     and not coalesce(fp.include_battle, false)
     and not coalesce(fp.include_special, false)
      then 'gender-forms'
    when coalesce(fp.include_regional, false)
     and coalesce(fp.include_alternate, false)
     and coalesce(fp.include_pattern, false)
     and coalesce(fp.include_gender, false)
     and coalesce(fp.include_battle, false)
     and not coalesce(fp.include_special, false)
      then 'battle-forms'
    else 'custom'
  end,
  'living',
  coalesce(fp.include_regional, false),
  coalesce(fp.include_alternate, false),
  coalesce(fp.include_pattern, false),
  coalesce(fp.include_gender, false),
  coalesce(fp.include_battle, false),
  coalesce(fp.include_special, false),
  true
from public.profiles p
left join public.user_form_preferences fp on fp.user_id = p.id
where not exists (
  select 1 from public.user_collection_views cv where cv.user_id = p.id
);

-- -------------------------------------------------------------
-- 3. New accounts automatically receive a standard Main Collection
-- -------------------------------------------------------------
create or replace function public.create_default_collection_view_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_collection_views (
    user_id,
    name,
    preset_id,
    goal,
    is_active
  )
  values (
    new.id,
    'Main Collection',
    'standard',
    'living',
    true
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.create_default_collection_view_for_profile() from public;

drop trigger if exists profiles_create_default_collection_view on public.profiles;
create trigger profiles_create_default_collection_view
after insert on public.profiles
for each row execute procedure public.create_default_collection_view_for_profile();

-- -------------------------------------------------------------
-- 4. Atomic collection switching + v0.9 compatibility mirror
-- -------------------------------------------------------------
-- Public profile summaries still read user_form_preferences. Activation updates
-- that row in the same transaction so there is never a split-brain definition.
create or replace function public.activate_own_collection_view(candidate uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target public.user_collection_views%rowtype;
begin
  if uid is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into target
  from public.user_collection_views cv
  where cv.id = candidate
    and cv.user_id = uid;

  if not found then
    raise exception 'That collection does not belong to this account.';
  end if;

  update public.user_collection_views
  set is_active = false
  where user_id = uid
    and is_active = true
    and id <> candidate;

  update public.user_collection_views
  set is_active = true
  where id = candidate
    and user_id = uid;

  insert into public.user_form_preferences (
    user_id,
    include_regional,
    include_alternate,
    include_pattern,
    include_gender,
    include_battle,
    include_special
  )
  values (
    uid,
    target.include_regional,
    target.include_alternate,
    target.include_pattern,
    target.include_gender,
    target.include_battle,
    target.include_special
  )
  on conflict (user_id) do update set
    include_regional = excluded.include_regional,
    include_alternate = excluded.include_alternate,
    include_pattern = excluded.include_pattern,
    include_gender = excluded.include_gender,
    include_battle = excluded.include_battle,
    include_special = excluded.include_special;
end;
$$;

revoke all on function public.activate_own_collection_view(uuid) from public;
grant execute on function public.activate_own_collection_view(uuid) to authenticated;

-- -------------------------------------------------------------
-- 5. Guardrail: users may keep a sensible number of saved definitions
-- -------------------------------------------------------------
create or replace function public.limit_saved_collection_views()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.user_collection_views
    where user_id = new.user_id
  ) >= 20 then
    raise exception 'DeviDex currently supports up to 20 saved collection setups per account.';
  end if;
  return new;
end;
$$;

drop trigger if exists user_collection_views_limit on public.user_collection_views;
create trigger user_collection_views_limit
before insert on public.user_collection_views
for each row execute procedure public.limit_saved_collection_views();

-- -------------------------------------------------------------
-- 6. Backup v3: saved collection definitions join the portable backup
-- -------------------------------------------------------------
create or replace function public.export_own_collection_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to export a collection.';
  end if;

  select jsonb_build_object(
    'national_progress', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'form_slug', f.slug,
          'normal_owned', cp.normal_owned,
          'shiny_owned', cp.shiny_owned,
          'notes', cp.notes
        ) order by f.slug
      )
      from public.collection_progress cp
      join public.pokemon_forms f on f.id = cp.form_id
      where cp.user_id = current_user_id
    ), '[]'::jsonb),
    'game_progress', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'game_slug', g.slug,
          'species_slug', s.slug,
          'normal_owned', gp.normal_owned,
          'shiny_owned', gp.shiny_owned,
          'notes', gp.notes
        ) order by g.slug, s.slug
      )
      from public.game_collection_progress gp
      join public.games g on g.id = gp.game_id
      join public.pokemon_species s on s.id = gp.species_id
      where gp.user_id = current_user_id
    ), '[]'::jsonb),
    'collection_views', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', cv.name,
          'preset_id', cv.preset_id,
          'goal', cv.goal,
          'include_regional', cv.include_regional,
          'include_alternate', cv.include_alternate,
          'include_pattern', cv.include_pattern,
          'include_gender', cv.include_gender,
          'include_battle', cv.include_battle,
          'include_special', cv.include_special,
          'is_active', cv.is_active
        ) order by cv.created_at, cv.name
      )
      from public.user_collection_views cv
      where cv.user_id = current_user_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_own_collection_v3() from public;
grant execute on function public.export_own_collection_v3() to authenticated;

create or replace function public.restore_own_collection_v3(
  national_rows jsonb,
  game_rows jsonb,
  collection_rows jsonb,
  replace_existing boolean default false
)
returns table (national_count integer, game_count integer, collection_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  collection_length integer;
  active_count integer;
  active_target public.user_collection_views%rowtype;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to restore a collection.';
  end if;

  if jsonb_typeof(collection_rows) <> 'array' then
    raise exception 'Saved collection definitions are invalid.';
  end if;

  collection_length := jsonb_array_length(collection_rows);
  if collection_length < 1 or collection_length > 20 then
    raise exception 'A v3 backup must contain between 1 and 20 saved collection definitions.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(collection_rows) as r(
      name text,
      preset_id text,
      goal text,
      include_regional boolean,
      include_alternate boolean,
      include_pattern boolean,
      include_gender boolean,
      include_battle boolean,
      include_special boolean,
      is_active boolean
    )
    where r.name is null
      or char_length(btrim(r.name)) not between 1 and 40
      or r.preset_id not in ('standard', 'forms', 'gender-forms', 'shiny', 'shiny-forms', 'battle-forms', 'everything', 'custom')
      or r.goal not in ('living', 'shiny', 'both')
      or r.include_regional is null
      or r.include_alternate is null
      or r.include_pattern is null
      or r.include_gender is null
      or r.include_battle is null
      or r.include_special is null
      or r.is_active is null
  ) then
    raise exception 'Saved collection backup contains an invalid definition.';
  end if;

  if exists (
    select 1
    from (
      select lower(btrim(r.name)) as key, count(*)
      from jsonb_to_recordset(collection_rows) as r(name text)
      group by lower(btrim(r.name))
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Saved collection backup contains duplicate names.';
  end if;

  select count(*) into active_count
  from jsonb_to_recordset(collection_rows) as r(is_active boolean)
  where r.is_active = true;

  if active_count <> 1 then
    raise exception 'A v3 backup must contain exactly one active collection.';
  end if;

  -- Reuse the already-audited stable-slug progress restore. Calling it here
  -- keeps the whole operation in one PostgreSQL transaction.
  perform * from public.restore_own_collection_v2(
    national_rows,
    game_rows,
    replace_existing
  );

  if replace_existing then
    delete from public.user_collection_views
    where user_id = current_user_id;

    insert into public.user_collection_views (
      user_id,
      name,
      preset_id,
      goal,
      include_regional,
      include_alternate,
      include_pattern,
      include_gender,
      include_battle,
      include_special,
      is_active
    )
    select
      current_user_id,
      btrim(r.name),
      r.preset_id,
      r.goal,
      r.include_regional,
      r.include_alternate,
      r.include_pattern,
      r.include_gender,
      r.include_battle,
      r.include_special,
      r.is_active
    from jsonb_to_recordset(collection_rows) as r(
      name text,
      preset_id text,
      goal text,
      include_regional boolean,
      include_alternate boolean,
      include_pattern boolean,
      include_gender boolean,
      include_battle boolean,
      include_special boolean,
      is_active boolean
    );
  else
    -- Merge only adds definitions whose names do not already exist. Existing
    -- setups win, and merge never silently switches the user's active view.
    insert into public.user_collection_views (
      user_id,
      name,
      preset_id,
      goal,
      include_regional,
      include_alternate,
      include_pattern,
      include_gender,
      include_battle,
      include_special,
      is_active
    )
    select
      current_user_id,
      btrim(r.name),
      r.preset_id,
      r.goal,
      r.include_regional,
      r.include_alternate,
      r.include_pattern,
      r.include_gender,
      r.include_battle,
      r.include_special,
      false
    from jsonb_to_recordset(collection_rows) as r(
      name text,
      preset_id text,
      goal text,
      include_regional boolean,
      include_alternate boolean,
      include_pattern boolean,
      include_gender boolean,
      include_battle boolean,
      include_special boolean,
      is_active boolean
    )
    where not exists (
      select 1
      from public.user_collection_views existing
      where existing.user_id = current_user_id
        and lower(btrim(existing.name)) = lower(btrim(r.name))
    );
  end if;

  select * into active_target
  from public.user_collection_views
  where user_id = current_user_id
    and is_active = true
  limit 1;

  if found then
    insert into public.user_form_preferences (
      user_id,
      include_regional,
      include_alternate,
      include_pattern,
      include_gender,
      include_battle,
      include_special
    ) values (
      current_user_id,
      active_target.include_regional,
      active_target.include_alternate,
      active_target.include_pattern,
      active_target.include_gender,
      active_target.include_battle,
      active_target.include_special
    )
    on conflict (user_id) do update set
      include_regional = excluded.include_regional,
      include_alternate = excluded.include_alternate,
      include_pattern = excluded.include_pattern,
      include_gender = excluded.include_gender,
      include_battle = excluded.include_battle,
      include_special = excluded.include_special;
  end if;

  return query select
    jsonb_array_length(national_rows),
    jsonb_array_length(game_rows),
    collection_length;
end;
$$;

revoke all on function public.restore_own_collection_v3(jsonb, jsonb, jsonb, boolean) from public;
grant execute on function public.restore_own_collection_v3(jsonb, jsonb, jsonb, boolean) to authenticated;

-- -------------------------------------------------------------
-- 7. Atomic edits to the active collection definition
-- -------------------------------------------------------------
create or replace function public.update_own_active_collection_definition(
  p_preset_id text,
  p_goal text,
  p_include_regional boolean,
  p_include_alternate boolean,
  p_include_pattern boolean,
  p_include_gender boolean,
  p_include_battle boolean,
  p_include_special boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  affected integer;
begin
  if uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_preset_id not in ('standard', 'forms', 'gender-forms', 'shiny', 'shiny-forms', 'battle-forms', 'everything', 'custom') then
    raise exception 'Invalid collection preset.';
  end if;
  if p_goal not in ('living', 'shiny', 'both') then
    raise exception 'Invalid collection goal.';
  end if;

  update public.user_collection_views
  set
    preset_id = p_preset_id,
    goal = p_goal,
    include_regional = p_include_regional,
    include_alternate = p_include_alternate,
    include_pattern = p_include_pattern,
    include_gender = p_include_gender,
    include_battle = p_include_battle,
    include_special = p_include_special
  where user_id = uid
    and is_active = true;

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Your account does not have exactly one active collection setup.';
  end if;

  insert into public.user_form_preferences (
    user_id,
    include_regional,
    include_alternate,
    include_pattern,
    include_gender,
    include_battle,
    include_special
  ) values (
    uid,
    p_include_regional,
    p_include_alternate,
    p_include_pattern,
    p_include_gender,
    p_include_battle,
    p_include_special
  )
  on conflict (user_id) do update set
    include_regional = excluded.include_regional,
    include_alternate = excluded.include_alternate,
    include_pattern = excluded.include_pattern,
    include_gender = excluded.include_gender,
    include_battle = excluded.include_battle,
    include_special = excluded.include_special;
end;
$$;

revoke all on function public.update_own_active_collection_definition(text,text,boolean,boolean,boolean,boolean,boolean,boolean) from public;
grant execute on function public.update_own_active_collection_definition(text,text,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
