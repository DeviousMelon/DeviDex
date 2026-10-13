-- =============================================================
-- DeviDex v0.8 - Phase 3: Collection Data Safety
-- Run AFTER migrations/008_account_stability_rollback.sql.
-- Safe to rerun during development.
--
-- This migration intentionally DOES NOT touch profile-save behaviour.
-- v0.7.2 is the known-good account/profile baseline.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Export collection progress with STABLE catalogue keys
-- -------------------------------------------------------------
-- Numeric identity IDs are convenient inside PostgreSQL, but poor long-term
-- backup identifiers. Form/game/species slugs are stable across catalogue
-- migrations and are therefore what v2 backup files store.
create or replace function public.export_own_collection_v2()
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
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_own_collection_v2() from public;
grant execute on function public.export_own_collection_v2() to authenticated;

-- -------------------------------------------------------------
-- 2. v2 restore using stable slugs
-- -------------------------------------------------------------
create or replace function public.restore_own_collection_v2(
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
  missing_key text;
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

  -- Browser validation is for friendliness; the database must still defend
  -- itself against somebody calling the RPC directly with hand-written JSON.
  if exists (
    select 1
    from jsonb_to_recordset(national_rows) as r(form_slug text, normal_owned boolean, shiny_owned boolean, notes text)
    where r.form_slug is null
      or btrim(r.form_slug) = ''
      or r.normal_owned is null
      or r.shiny_owned is null
  ) then
    raise exception 'National backup contains an invalid row.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(game_rows) as r(game_slug text, species_slug text, normal_owned boolean, shiny_owned boolean, notes text)
    where r.game_slug is null
      or btrim(r.game_slug) = ''
      or r.species_slug is null
      or btrim(r.species_slug) = ''
      or r.normal_owned is null
      or r.shiny_owned is null
  ) then
    raise exception 'Game Dex backup contains an invalid row.';
  end if;

  -- Fail before changing anything if the file contains duplicate stable keys.
  if exists (
    select 1
    from (
      select lower(btrim(r.form_slug)) as key, count(*)
      from jsonb_to_recordset(national_rows) as r(form_slug text, normal_owned boolean, shiny_owned boolean, notes text)
      group by lower(btrim(r.form_slug))
      having count(*) > 1
    ) d
  ) then
    raise exception 'National backup contains duplicate form keys.';
  end if;

  if exists (
    select 1
    from (
      select lower(btrim(r.game_slug)) || '::' || lower(btrim(r.species_slug)) as key, count(*)
      from jsonb_to_recordset(game_rows) as r(game_slug text, species_slug text, normal_owned boolean, shiny_owned boolean, notes text)
      group by lower(btrim(r.game_slug)) || '::' || lower(btrim(r.species_slug))
      having count(*) > 1
    ) d
  ) then
    raise exception 'Game Dex backup contains duplicate game/species keys.';
  end if;

  -- Strict lookup validation prevents a future catalogue change from silently
  -- dropping rows. If a key no longer exists, the restore stops and explains
  -- which entry needs attention.
  select r.form_slug into missing_key
  from jsonb_to_recordset(national_rows) as r(form_slug text, normal_owned boolean, shiny_owned boolean, notes text)
  left join public.pokemon_forms f on lower(f.slug) = lower(btrim(r.form_slug))
  where f.id is null
  limit 1;

  if missing_key is not null then
    raise exception 'Backup references an unknown form: %', missing_key;
  end if;

  missing_key := null;
  select r.game_slug into missing_key
  from jsonb_to_recordset(game_rows) as r(game_slug text, species_slug text, normal_owned boolean, shiny_owned boolean, notes text)
  left join public.games g on lower(g.slug) = lower(btrim(r.game_slug))
  where g.id is null
  limit 1;

  if missing_key is not null then
    raise exception 'Backup references an unknown game: %', missing_key;
  end if;

  missing_key := null;
  select r.species_slug into missing_key
  from jsonb_to_recordset(game_rows) as r(game_slug text, species_slug text, normal_owned boolean, shiny_owned boolean, notes text)
  left join public.pokemon_species s on lower(s.slug) = lower(btrim(r.species_slug))
  where s.id is null
  limit 1;

  if missing_key is not null then
    raise exception 'Backup references an unknown species: %', missing_key;
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
    f.id,
    coalesce(r.normal_owned, false),
    coalesce(r.shiny_owned, false),
    r.notes
  from jsonb_to_recordset(national_rows) as r(
    form_slug text,
    normal_owned boolean,
    shiny_owned boolean,
    notes text
  )
  join public.pokemon_forms f on lower(f.slug) = lower(btrim(r.form_slug))
  on conflict (user_id, form_id) do update set
    -- In merge mode, imported FALSE values can never erase current TRUEs.
    normal_owned = case
      when replace_existing then excluded.normal_owned
      else collection_progress.normal_owned or excluded.normal_owned
    end,
    shiny_owned = case
      when replace_existing then excluded.shiny_owned
      else collection_progress.shiny_owned or excluded.shiny_owned
    end,
    notes = case
      when replace_existing then excluded.notes
      when nullif(btrim(collection_progress.notes), '') is not null then collection_progress.notes
      else excluded.notes
    end;

  insert into public.game_collection_progress (
    user_id, game_id, species_id, normal_owned, shiny_owned, notes
  )
  select
    current_user_id,
    g.id,
    s.id,
    coalesce(r.normal_owned, false),
    coalesce(r.shiny_owned, false),
    r.notes
  from jsonb_to_recordset(game_rows) as r(
    game_slug text,
    species_slug text,
    normal_owned boolean,
    shiny_owned boolean,
    notes text
  )
  join public.games g on lower(g.slug) = lower(btrim(r.game_slug))
  join public.pokemon_species s on lower(s.slug) = lower(btrim(r.species_slug))
  on conflict (user_id, game_id, species_id) do update set
    normal_owned = case
      when replace_existing then excluded.normal_owned
      else game_collection_progress.normal_owned or excluded.normal_owned
    end,
    shiny_owned = case
      when replace_existing then excluded.shiny_owned
      else game_collection_progress.shiny_owned or excluded.shiny_owned
    end,
    notes = case
      when replace_existing then excluded.notes
      when nullif(btrim(game_collection_progress.notes), '') is not null then game_collection_progress.notes
      else excluded.notes
    end;

  return query select national_length, game_length;
end;
$$;

revoke all on function public.restore_own_collection_v2(jsonb, jsonb, boolean) from public;
grant execute on function public.restore_own_collection_v2(jsonb, jsonb, boolean) to authenticated;

-- -------------------------------------------------------------
-- 3. Make legacy v1 "merge" non-destructive too
-- -------------------------------------------------------------
-- Old backup files use numeric IDs. We retain their restore function so nobody
-- loses access to a backup simply because DeviDex moved to the safer v2 format.
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
    normal_owned = case
      when replace_existing then excluded.normal_owned
      else collection_progress.normal_owned or excluded.normal_owned
    end,
    shiny_owned = case
      when replace_existing then excluded.shiny_owned
      else collection_progress.shiny_owned or excluded.shiny_owned
    end,
    notes = case
      when replace_existing then excluded.notes
      when nullif(btrim(collection_progress.notes), '') is not null then collection_progress.notes
      else excluded.notes
    end;

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
    normal_owned = case
      when replace_existing then excluded.normal_owned
      else game_collection_progress.normal_owned or excluded.normal_owned
    end,
    shiny_owned = case
      when replace_existing then excluded.shiny_owned
      else game_collection_progress.shiny_owned or excluded.shiny_owned
    end,
    notes = case
      when replace_existing then excluded.notes
      when nullif(btrim(game_collection_progress.notes), '') is not null then game_collection_progress.notes
      else excluded.notes
    end;

  return query select national_length, game_length;
end;
$$;

revoke all on function public.restore_own_collection(jsonb, jsonb, boolean) from public;
grant execute on function public.restore_own_collection(jsonb, jsonb, boolean) to authenticated;

-- -------------------------------------------------------------
-- 4. Reassert the privacy boundary explicitly
-- -------------------------------------------------------------
-- These are deliberately redundant with earlier migrations. Reasserting them
-- here makes the Phase 3 safety migration self-auditing after account work.
alter table public.collection_progress enable row level security;
alter table public.game_collection_progress enable row level security;

drop policy if exists "Users can read own collection progress" on public.collection_progress;
create policy "Users can read own collection progress"
on public.collection_progress for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own collection progress" on public.collection_progress;
create policy "Users can insert own collection progress"
on public.collection_progress for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own collection progress" on public.collection_progress;
create policy "Users can update own collection progress"
on public.collection_progress for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own collection progress" on public.collection_progress;
create policy "Users can delete own collection progress"
on public.collection_progress for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own game progress" on public.game_collection_progress;
create policy "Users can read own game progress"
on public.game_collection_progress for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own game progress" on public.game_collection_progress;
create policy "Users can insert own game progress"
on public.game_collection_progress for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own game progress" on public.game_collection_progress;
create policy "Users can update own game progress"
on public.game_collection_progress for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own game progress" on public.game_collection_progress;
create policy "Users can delete own game progress"
on public.game_collection_progress for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.collection_progress to authenticated;
grant select, insert, update, delete on public.game_collection_progress to authenticated;
