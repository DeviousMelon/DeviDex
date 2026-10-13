-- =============================================================
-- DeviDex v1.2 - Phase 6B: forms inside shared Game Dexes
--
-- Adds per-game form availability and per-game alternate-form progress.
-- Existing base-species Game Dex progress remains untouched.
-- Run after v1.1-phase6a-shared-game-dexes.sql.
-- =============================================================

-- Preserve the source version group so the availability importer can avoid
-- showing later-invented forms in earlier generations. Re-running the existing
-- Forms importer after this migration fills the column.
alter table public.pokemon_forms
  add column if not exists introduced_version_group text;

-- -------------------------------------------------------------
-- 1. Which optional form exists in which game ecosystem?
-- -------------------------------------------------------------
-- This table is catalogue/reference data. The Admin importer fills it from
-- PokéAPI's pokemon_game_indices.csv using pokemon_forms.source_pokemon_id.
-- A row means DeviDex has evidence that this form/variety exists in that game.
create table if not exists public.game_form_availability (
  game_id bigint not null references public.games(id) on delete cascade,
  form_id bigint not null references public.pokemon_forms(id) on delete cascade,
  source text not null default 'pokeapi-game-index',
  notes text,
  created_at timestamptz not null default now(),
  primary key (game_id, form_id)
);

create index if not exists game_form_availability_form_idx
  on public.game_form_availability(form_id, game_id);

alter table public.game_form_availability enable row level security;

drop policy if exists "Anyone can read game form availability" on public.game_form_availability;
create policy "Anyone can read game form availability"
on public.game_form_availability for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage game form availability" on public.game_form_availability;
create policy "Admins can manage game form availability"
on public.game_form_availability for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.game_form_availability to anon, authenticated;
grant insert, update, delete on public.game_form_availability to authenticated;

-- -------------------------------------------------------------
-- 2. Per-game progress for OPTIONAL forms
-- -------------------------------------------------------------
-- Base/default species continue using game_collection_progress exactly as they
-- did in v1.1. Keeping alternate forms separate avoids a risky migration of a
-- table that already contains working user data.
create table if not exists public.game_form_collection_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  form_id bigint not null references public.pokemon_forms(id) on delete cascade,
  normal_owned boolean not null default false,
  shiny_owned boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, form_id)
);

create index if not exists game_form_collection_progress_user_game_idx
  on public.game_form_collection_progress(user_id, game_id);

alter table public.game_form_collection_progress enable row level security;

drop trigger if exists game_form_collection_progress_set_updated_at on public.game_form_collection_progress;
create trigger game_form_collection_progress_set_updated_at
before update on public.game_form_collection_progress
for each row execute procedure public.set_updated_at();

drop policy if exists "Users can read own game form progress" on public.game_form_collection_progress;
create policy "Users can read own game form progress"
on public.game_form_collection_progress for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own game form progress" on public.game_form_collection_progress;
create policy "Users can insert own game form progress"
on public.game_form_collection_progress for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own game form progress" on public.game_form_collection_progress;
create policy "Users can update own game form progress"
on public.game_form_collection_progress for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own game form progress" on public.game_form_collection_progress;
create policy "Users can delete own game form progress"
on public.game_form_collection_progress for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.game_form_collection_progress to authenticated;

-- -------------------------------------------------------------
-- 3. Backup v4 includes per-game form progress
-- -------------------------------------------------------------
create or replace function public.export_own_collection_v4()
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
    'game_form_progress', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'game_slug', g.slug,
          'form_slug', f.slug,
          'normal_owned', gfp.normal_owned,
          'shiny_owned', gfp.shiny_owned,
          'notes', gfp.notes
        ) order by g.slug, f.slug
      )
      from public.game_form_collection_progress gfp
      join public.games g on g.id = gfp.game_id
      join public.pokemon_forms f on f.id = gfp.form_id
      where gfp.user_id = current_user_id
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

revoke all on function public.export_own_collection_v4() from public;
grant execute on function public.export_own_collection_v4() to authenticated;

create or replace function public.restore_own_collection_v4(
  national_rows jsonb,
  game_rows jsonb,
  game_form_rows jsonb,
  collection_rows jsonb,
  replace_existing boolean default false
)
returns table (
  national_count integer,
  game_count integer,
  game_form_count integer,
  collection_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  form_count integer;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to restore a collection.';
  end if;

  if jsonb_typeof(game_form_rows) <> 'array' then
    raise exception 'Game form progress is invalid.';
  end if;

  form_count := jsonb_array_length(game_form_rows);
  if form_count > 50000 then
    raise exception 'That backup contains an unreasonable number of Game Dex form rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(game_form_rows) as r(
      game_slug text,
      form_slug text,
      normal_owned boolean,
      shiny_owned boolean,
      notes text
    )
    where r.game_slug is null
      or char_length(btrim(r.game_slug)) not between 1 and 200
      or r.form_slug is null
      or char_length(btrim(r.form_slug)) not between 1 and 200
      or r.normal_owned is null
      or r.shiny_owned is null
      or (r.notes is not null and char_length(r.notes) > 10000)
  ) then
    raise exception 'Game form backup contains an invalid row.';
  end if;

  if exists (
    select 1
    from (
      select lower(btrim(r.game_slug)) as game_key,
             lower(btrim(r.form_slug)) as form_key,
             count(*)
      from jsonb_to_recordset(game_form_rows) as r(game_slug text, form_slug text)
      group by lower(btrim(r.game_slug)), lower(btrim(r.form_slug))
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Game form backup contains duplicate rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(game_form_rows) as r(game_slug text, form_slug text)
    left join public.games g on lower(g.slug) = lower(btrim(r.game_slug))
    left join public.pokemon_forms f on lower(f.slug) = lower(btrim(r.form_slug))
    where g.id is null or f.id is null or f.is_default = true
  ) then
    raise exception 'Game form backup references an unknown game/form or a base species slot.';
  end if;

  -- Reuse the thoroughly tested v3 restore for National Dex progress, base
  -- Game Dex progress and saved collection setups. Because this call occurs
  -- inside this function, all four sections still succeed or fail together.
  perform * from public.restore_own_collection_v3(
    national_rows,
    game_rows,
    collection_rows,
    replace_existing
  );

  if replace_existing then
    delete from public.game_form_collection_progress
    where user_id = current_user_id;
  end if;

  insert into public.game_form_collection_progress (
    user_id,
    game_id,
    form_id,
    normal_owned,
    shiny_owned,
    notes
  )
  select
    current_user_id,
    g.id,
    f.id,
    r.normal_owned,
    r.shiny_owned,
    r.notes
  from jsonb_to_recordset(game_form_rows) as r(
    game_slug text,
    form_slug text,
    normal_owned boolean,
    shiny_owned boolean,
    notes text
  )
  join public.games g on lower(g.slug) = lower(btrim(r.game_slug))
  join public.pokemon_forms f on lower(f.slug) = lower(btrim(r.form_slug))
  on conflict (user_id, game_id, form_id) do update set
    normal_owned = case
      when replace_existing then excluded.normal_owned
      else public.game_form_collection_progress.normal_owned or excluded.normal_owned
    end,
    shiny_owned = case
      when replace_existing then excluded.shiny_owned
      else public.game_form_collection_progress.shiny_owned or excluded.shiny_owned
    end,
    notes = case
      when replace_existing then excluded.notes
      else coalesce(public.game_form_collection_progress.notes, excluded.notes)
    end;

  return query select
    jsonb_array_length(national_rows),
    jsonb_array_length(game_rows),
    form_count,
    jsonb_array_length(collection_rows);
end;
$$;

revoke all on function public.restore_own_collection_v4(jsonb, jsonb, jsonb, jsonb, boolean) from public;
grant execute on function public.restore_own_collection_v4(jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
