-- =============================================================
-- DeviDex v2.0 - Pokémon Bank shutdown prep
--
-- Run AFTER v2.1.1, before deploying the matching frontend. Safe to rerun.
-- Written to v2.1 standard: policies use (select auth.uid()) and
-- (select public.is_admin()), and the trigger functions are not callable
-- over the API.
--
-- Pokémon Bank closes for good at 03:00 Irish time on Fri 26 Feb 2027
-- (7pm PT Thu 25 Feb). After that nothing in Bank, or in any 3DS/DS/GBA game,
-- can reach HOME. This adds three things:
--
-- - bank_checklist: Pokémon you still have in Bank or an old game, and
--   whether you've moved them to HOME yet.
-- - ribbon_plans: one row per Ribbon Master project. The ribbon list itself
--   lives in the frontend (src/lib/bankRibbons.ts) so it can be corrected
--   without a migration; this table just stores your progress through it.
-- - bank_last_chance: an admin-curated "get these before Bank closes" list,
--   readable by everyone, plus bank_last_chance_done for your own ticks.
--
-- Every user table cascades from profiles, so delete_own_account() still
-- removes everything.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Shared value lists
-- -------------------------------------------------------------
-- Where a Pokémon in the checklist currently lives.
--   bank      - in a Pokémon Bank box
--   game_3ds  - in X/Y, ORAS, Sun/Moon, USUM or a Virtual Console game
--   game_ds   - in a Gen 4 or Gen 5 game (still needs Poké Transfer/Transporter)
--   game_gba  - in a Gen 3 game or Colosseum/XD (still needs Pal Park)

-- Ribbon plan stages, in the only order Pokémon can travel:
--   gen3 -> (Pal Park) -> gen4 -> (Poké Transfer) -> gen5
--        -> (Poké Transporter) -> gen6 -> (Bank) -> gen7 -> (Bank) -> home
-- Every arrow is one-way.

-- -------------------------------------------------------------
-- 2. Ribbon Master plans
-- -------------------------------------------------------------
create table if not exists public.ribbon_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  form_id bigint references public.pokemon_forms(id) on delete set null,
  shiny boolean not null default false,
  origin text not null check (origin in (
    'rse', 'frlg', 'colosseum-xd',
    'dppt', 'hgss',
    'bw', 'b2w2',
    'xy', 'oras',
    'sm', 'usum', 'vc'
  )),
  current_stage text not null check (current_stage in ('gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'home')),
  -- Ribbon ids from src/lib/bankRibbons.ts. Text, not foreign keys, on purpose.
  completed_ribbons text[] not null default '{}',
  skipped_ribbons text[] not null default '{}',
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ribbon_plans_user_idx on public.ribbon_plans (user_id, created_at);

drop trigger if exists ribbon_plans_set_updated_at on public.ribbon_plans;
create trigger ribbon_plans_set_updated_at
before update on public.ribbon_plans
for each row execute procedure public.set_updated_at();

alter table public.ribbon_plans enable row level security;
revoke all on public.ribbon_plans from anon, authenticated;
grant select, insert, update, delete on public.ribbon_plans to authenticated;

drop policy if exists "Users can read own ribbon plans" on public.ribbon_plans;
create policy "Users can read own ribbon plans"
on public.ribbon_plans for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add own ribbon plans" on public.ribbon_plans;
create policy "Users can add own ribbon plans"
on public.ribbon_plans for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own ribbon plans" on public.ribbon_plans;
create policy "Users can update own ribbon plans"
on public.ribbon_plans for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own ribbon plans" on public.ribbon_plans;
create policy "Users can delete own ribbon plans"
on public.ribbon_plans for delete to authenticated
using ((select auth.uid()) = user_id);

-- No one can hoard thousands of plans by accident (or on purpose).
create or replace function public.ribbon_plans_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.ribbon_plans p where p.user_id = new.user_id) >= 100 then
    raise exception 'You can have up to 100 Ribbon Master plans.';
  end if;
  return new;
end;
$$;

-- Trigger function: not callable over the API (same as v2.1.1). The trigger still fires.
revoke execute on function public.ribbon_plans_limit() from public, anon, authenticated;

drop trigger if exists ribbon_plans_limit on public.ribbon_plans;
create trigger ribbon_plans_limit
before insert on public.ribbon_plans
for each row execute procedure public.ribbon_plans_limit();

-- -------------------------------------------------------------
-- 3. Still-in-Bank checklist
-- -------------------------------------------------------------
create table if not exists public.bank_checklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  form_id bigint references public.pokemon_forms(id) on delete set null,
  shiny boolean not null default false,
  location text not null default 'bank' check (location in ('bank', 'game_3ds', 'game_ds', 'game_gba')),
  -- Free text so "Box 12, slot 4" or "Emerald save, PC box 3" both work.
  box_note text check (box_note is null or char_length(box_note) <= 80),
  -- Ticking "wait for ribbons" shows DO NOT TRANSFER YET on the item.
  hold_for_ribbons boolean not null default false,
  moved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_checklist_user_idx on public.bank_checklist (user_id, created_at);

drop trigger if exists bank_checklist_set_updated_at on public.bank_checklist;
create trigger bank_checklist_set_updated_at
before update on public.bank_checklist
for each row execute procedure public.set_updated_at();

alter table public.bank_checklist enable row level security;
revoke all on public.bank_checklist from anon, authenticated;
grant select, insert, update, delete on public.bank_checklist to authenticated;

drop policy if exists "Users can read own bank checklist" on public.bank_checklist;
create policy "Users can read own bank checklist"
on public.bank_checklist for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add to own bank checklist" on public.bank_checklist;
create policy "Users can add to own bank checklist"
on public.bank_checklist for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own bank checklist" on public.bank_checklist;
create policy "Users can update own bank checklist"
on public.bank_checklist for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete from own bank checklist" on public.bank_checklist;
create policy "Users can delete from own bank checklist"
on public.bank_checklist for delete to authenticated
using ((select auth.uid()) = user_id);

-- Bank itself holds 3,000, so that's a sensible ceiling.
create or replace function public.bank_checklist_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.bank_checklist c where c.user_id = new.user_id) >= 3000 then
    raise exception 'The checklist holds up to 3,000 Pokémon, same as Bank.';
  end if;
  return new;
end;
$$;

-- Trigger function: not callable over the API (same as v2.1.1). The trigger still fires.
revoke execute on function public.bank_checklist_limit() from public, anon, authenticated;

drop trigger if exists bank_checklist_limit on public.bank_checklist;
create trigger bank_checklist_limit
before insert on public.bank_checklist
for each row execute procedure public.bank_checklist_limit();

-- -------------------------------------------------------------
-- 4. "Last chance" list (admin-curated, public)
-- -------------------------------------------------------------
create table if not exists public.bank_last_chance (
  id bigint generated by default as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (category in ('origin', 'ribbon', 'event', 'form', 'other')),
  description text not null default '' check (char_length(description) <= 1000),
  -- Optional links so the Pokémon page can show "only before Bank closes".
  species_id integer references public.pokemon_species(id) on delete set null,
  form_id bigint references public.pokemon_forms(id) on delete set null,
  source_url text check (source_url is null or source_url ~ '^https://'),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_last_chance_species_idx on public.bank_last_chance (species_id) where species_id is not null;
create index if not exists bank_last_chance_form_idx on public.bank_last_chance (form_id);

drop trigger if exists bank_last_chance_set_updated_at on public.bank_last_chance;
create trigger bank_last_chance_set_updated_at
before update on public.bank_last_chance
for each row execute procedure public.set_updated_at();

alter table public.bank_last_chance enable row level security;
revoke all on public.bank_last_chance from anon, authenticated;
grant select on public.bank_last_chance to anon, authenticated;
grant insert, update, delete on public.bank_last_chance to authenticated;

-- Two policies, because visitors may not call is_admin() at all: a policy
-- that mentions it fails with "permission denied" for them, even when
-- is_published alone would have let the row through.
drop policy if exists "Anyone can read published last-chance entries" on public.bank_last_chance;
drop policy if exists "Visitors can read published last-chance entries" on public.bank_last_chance;
create policy "Visitors can read published last-chance entries"
on public.bank_last_chance for select to anon
using (is_published);

drop policy if exists "Users can read published last-chance entries" on public.bank_last_chance;
create policy "Users can read published last-chance entries"
on public.bank_last_chance for select to authenticated
using (is_published or (select public.is_admin()));

drop policy if exists "Admins can add last-chance entries" on public.bank_last_chance;
create policy "Admins can add last-chance entries"
on public.bank_last_chance for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update last-chance entries" on public.bank_last_chance;
create policy "Admins can update last-chance entries"
on public.bank_last_chance for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete last-chance entries" on public.bank_last_chance;
create policy "Admins can delete last-chance entries"
on public.bank_last_chance for delete to authenticated
using ((select public.is_admin()));

-- Your own ticks on that list.
create table if not exists public.bank_last_chance_done (
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id bigint not null references public.bank_last_chance(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

alter table public.bank_last_chance_done enable row level security;
revoke all on public.bank_last_chance_done from anon, authenticated;
grant select, insert, delete on public.bank_last_chance_done to authenticated;

drop policy if exists "Users can read own last-chance ticks" on public.bank_last_chance_done;
create policy "Users can read own last-chance ticks"
on public.bank_last_chance_done for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add own last-chance ticks" on public.bank_last_chance_done;
create policy "Users can add own last-chance ticks"
on public.bank_last_chance_done for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove own last-chance ticks" on public.bank_last_chance_done;
create policy "Users can remove own last-chance ticks"
on public.bank_last_chance_done for delete to authenticated
using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- 5. Starter last-chance entries
-- -------------------------------------------------------------
-- Broad categories only. Add specific Pokémon from the Admin page.
-- Rerunning updates the wording but never re-publishes one you hid.
insert into public.bank_last_chance (slug, title, category, description, sort_order)
values
  ('origin-gen-3', 'Gen 3 origin Pokémon (GBA and GameCube)', 'origin',
   'Pokémon caught in Ruby, Sapphire, Emerald, FireRed, LeafGreen, Colosseum or XD reach HOME only through Pal Park, Poké Transfer, Poké Transporter and Bank. Note: the Switch editions of FireRed and LeafGreen connect to HOME directly, so Pokémon from those are a separate case.', 10),
  ('origin-gen-4', 'Gen 4 origin Pokémon', 'origin',
   'Anything caught or hatched in Diamond, Pearl, Platinum, HeartGold or SoulSilver. Route: Poké Transfer to Gen 5, Poké Transporter, Bank, then HOME.', 20),
  ('origin-gen-5', 'Gen 5 origin Pokémon', 'origin',
   'Anything from Black, White, Black 2 or White 2. Route: Poké Transporter, Bank, then HOME.', 30),
  ('origin-gen-6', 'Gen 6 origin Pokémon (pentagon mark)', 'origin',
   'Pokémon from X, Y, Omega Ruby or Alpha Sapphire. The pentagon origin mark only exists on Pokémon that came through Bank.', 40),
  ('origin-gen-7', 'Gen 7 origin Pokémon (clover mark)', 'origin',
   'Pokémon from Sun, Moon, Ultra Sun or Ultra Moon. The clover origin mark only exists on Pokémon that came through Bank.', 50),
  ('origin-virtual-console', 'Virtual Console Gen 1 and 2 Pokémon (Game Boy mark)', 'origin',
   'Pokémon from the 3DS Virtual Console releases of Red, Blue, Yellow, Gold, Silver and Crystal travel by Poké Transporter into Sun/Moon or Ultra Sun/Ultra Moon via Bank.', 60),
  ('ribbons-pre-home', 'Ribbons only earnable in Gen 3 to 7 games', 'ribbon',
   'Contest, Battle Tower, Battle Maison, Battle Tree and regional Champion ribbons from these games can only be earned before a Pokémon leaves for HOME. Use the Ribbon Master planner.', 70),
  ('purified-shadow', 'Purified Shadow Pokémon from Colosseum and XD', 'origin',
   'These carry the National Ribbon and Colosseum/XD origin, and can only leave via Gen 3, Pal Park and the rest of the chain.', 80),
  ('old-events', 'Event Pokémon received in GBA, DS or 3DS games', 'event',
   'Old distributions still sitting in a save file or in Bank. Check every box before the deadline.', 90)
on conflict (slug) do update set
  title = excluded.title,
  category = excluded.category,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- -------------------------------------------------------------
-- 6. Front-page summary in one call
-- -------------------------------------------------------------
create or replace function public.get_bank_prep_summary()
returns table (
  still_to_move integer,
  held_for_ribbons integer,
  moved integer,
  active_plans integer,
  last_chance_open integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::int from public.bank_checklist c where c.user_id = auth.uid() and c.moved_at is null),
    (select count(*)::int from public.bank_checklist c where c.user_id = auth.uid() and c.moved_at is null and c.hold_for_ribbons),
    (select count(*)::int from public.bank_checklist c where c.user_id = auth.uid() and c.moved_at is not null),
    (select count(*)::int from public.ribbon_plans p where p.user_id = auth.uid() and p.current_stage <> 'home'),
    (select count(*)::int from public.bank_last_chance e
      where e.is_published
        and not exists (select 1 from public.bank_last_chance_done d where d.entry_id = e.id and d.user_id = auth.uid()));
$$;

revoke all on function public.get_bank_prep_summary() from public, anon;
grant execute on function public.get_bank_prep_summary() to authenticated, service_role;

-- Foreign-key indexes the Supabase performance advisor asks for. The
-- entry_id one also keeps deleting a last-chance entry fast.
create index if not exists ribbon_plans_form_idx on public.ribbon_plans (form_id);
create index if not exists bank_checklist_form_idx on public.bank_checklist (form_id);
create index if not exists bank_last_chance_done_entry_idx on public.bank_last_chance_done (entry_id);

-- Let the API see the new tables and function straight away.
notify pgrst, 'reload schema';
