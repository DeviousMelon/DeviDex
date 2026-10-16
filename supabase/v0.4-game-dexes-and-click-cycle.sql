-- NOTE (v2.2): the game_dex_entries changes below are for a table v2.2 drops.
-- If you re-run this file, run v2.2-drop-unused-objects.sql again afterwards.

-- =============================================================
-- DeviDex v0.4 - individual Game Dex progress foundation
--
-- Run ONCE after v0.3-core-living-dex.sql.
-- Safe to rerun during development.
-- =============================================================

-- The v0.3 table assumed one Pokédex placement per species/game. Some games
-- divide their regional Pokédex into multiple named sections, so preserve the
-- source Pokédex identity as part of the key.
alter table public.game_dex_entries
  add column if not exists dex_slug text,
  add column if not exists dex_name text,
  add column if not exists dex_order integer not null default 0;

update public.game_dex_entries
set
  dex_slug = coalesce(dex_slug, 'regional'),
  dex_name = coalesce(dex_name, 'Regional Dex')
where dex_slug is null or dex_name is null;

alter table public.game_dex_entries
  alter column dex_slug set default 'regional',
  alter column dex_slug set not null,
  alter column dex_name set default 'Regional Dex',
  alter column dex_name set not null;

-- Rebuild the primary key so the same species can legitimately occur in more
-- than one named regional section without creating duplicate-key errors.
alter table public.game_dex_entries drop constraint if exists game_dex_entries_pkey;
alter table public.game_dex_entries
  add constraint game_dex_entries_pkey primary key (game_id, dex_slug, species_id);

create index if not exists game_dex_entries_game_order_idx
  on public.game_dex_entries(game_id, dex_order, dex_number);

-- Progress is intentionally separate from the National Living Dex. A user can
-- therefore complete Platinum, Ultra Moon, etc. independently.
create table if not exists public.game_collection_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  species_id integer not null references public.pokemon_species(id) on delete cascade,
  normal_owned boolean not null default false,
  shiny_owned boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, species_id)
);

create index if not exists game_collection_progress_user_game_idx
  on public.game_collection_progress(user_id, game_id);

alter table public.game_collection_progress enable row level security;

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

grant select, insert, update, delete on public.game_collection_progress to authenticated;

-- Reuse the existing updated_at trigger helper created in v0.3.
drop trigger if exists game_collection_progress_set_updated_at on public.game_collection_progress;
create trigger game_collection_progress_set_updated_at
before update on public.game_collection_progress
for each row execute procedure public.set_updated_at();
