-- =============================================================
-- DeviDex v0.6 - account safety, privacy and data ownership
-- Run AFTER migrations/004_public_accounts.sql.
-- Safe to rerun during development.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Optional public collection SUMMARY
-- -------------------------------------------------------------
alter table public.profiles
  add column if not exists collection_public boolean not null default false;

-- v0.5 intentionally restricted which profile columns browser clients may
-- update. Add the new privacy switch without granting access to role/security.
grant update (
  username,
  display_name,
  avatar_path,
  home_friend_code,
  home_friend_code_public,
  profile_public,
  collection_public
) on public.profiles to authenticated;

-- The return shape changed in v0.6, so PostgreSQL requires dropping the old
-- function rather than CREATE OR REPLACE with a different table signature.
drop function if exists public.get_public_profile(text);
create function public.get_public_profile(candidate text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  home_friend_code text,
  home_friend_code_public boolean,
  profile_public boolean,
  collection_public boolean,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_path,
    case when p.home_friend_code_public then p.home_friend_code else null end,
    p.home_friend_code_public,
    p.profile_public,
    p.collection_public,
    p.role,
    p.created_at,
    p.updated_at
  from public.profiles p
  where p.username is not null
    and p.profile_public = true
    and lower(p.username) = lower(btrim(candidate))
  limit 1;
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- This exposes COUNTS only. There is deliberately no policy that lets another
-- user browse raw collection_progress/game_collection_progress rows.
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
  totals as (
    select count(*)::bigint as trackable_total
    from public.pokemon_forms f
    where f.is_trackable = true
  ),
  national as (
    select
      count(*) filter (where cp.normal_owned)::bigint as living_owned,
      count(*) filter (where cp.shiny_owned)::bigint as shiny_owned
    from public.collection_progress cp
    join target t on t.id = cp.user_id
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

-- -------------------------------------------------------------
-- 2. Self-service account deletion
-- -------------------------------------------------------------
-- Deleting auth.users cascades into profiles and collection rows because the
-- existing foreign keys use ON DELETE CASCADE. The function can ONLY target
-- auth.uid(); callers never supply a user ID.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be signed in to delete an account.';
  end if;

  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- -------------------------------------------------------------
-- 3. Transactional collection restore
-- -------------------------------------------------------------
-- Replace mode must be all-or-nothing. Doing DELETE followed by thousands of
-- browser upserts could leave a half-restored collection if row 742 failed.
-- One PostgreSQL function gives the restore proper transaction semantics.
create or replace function public.restore_own_collection(
  national_rows jsonb,
  game_rows jsonb,
  replace_existing boolean default false
)
returns table (national_count integer, game_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  national_length integer;
  game_length integer;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to restore a collection.';
  end if;

  if jsonb_typeof(national_rows) <> 'array' or jsonb_typeof(game_rows) <> 'array' then
    raise exception 'Collection backup arrays are invalid.';
  end if;

  national_length := jsonb_array_length(national_rows);
  game_length := jsonb_array_length(game_rows);

  if national_length > 10000 or game_length > 50000 then
    raise exception 'Collection backup contains too many rows.';
  end if;

  if replace_existing then
    delete from public.collection_progress where user_id = current_user_id;
    delete from public.game_collection_progress where user_id = current_user_id;
  end if;

  insert into public.collection_progress (
    user_id, form_id, normal_owned, shiny_owned, notes
  )
  select
    current_user_id,
    r.form_id,
    coalesce(r.normal_owned, false),
    coalesce(r.shiny_owned, false),
    r.notes
  from jsonb_to_recordset(national_rows) as r(
    form_id bigint,
    normal_owned boolean,
    shiny_owned boolean,
    notes text
  )
  on conflict (user_id, form_id) do update set
    normal_owned = excluded.normal_owned,
    shiny_owned = excluded.shiny_owned,
    notes = excluded.notes;

  insert into public.game_collection_progress (
    user_id, game_id, species_id, normal_owned, shiny_owned, notes
  )
  select
    current_user_id,
    r.game_id,
    r.species_id,
    coalesce(r.normal_owned, false),
    coalesce(r.shiny_owned, false),
    r.notes
  from jsonb_to_recordset(game_rows) as r(
    game_id bigint,
    species_id integer,
    normal_owned boolean,
    shiny_owned boolean,
    notes text
  )
  on conflict (user_id, game_id, species_id) do update set
    normal_owned = excluded.normal_owned,
    shiny_owned = excluded.shiny_owned,
    notes = excluded.notes;

  return query select national_length, game_length;
end;
$$;

revoke all on function public.restore_own_collection(jsonb, jsonb, boolean) from public;
grant execute on function public.restore_own_collection(jsonb, jsonb, boolean) to authenticated;
